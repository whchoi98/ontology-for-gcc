"""CLI: --neptune --opensearch --weather --from-s3 --raw-dir <path>.
Real → Synthetic → External 순서로 노드·엣지 NDJSON을 S3에 업로드 후 Bulk Load."""
from __future__ import annotations
import argparse, os, json, boto3
from pathlib import Path
from data.real import (coupon_fact, transaction, term_agreement,
                        opinet_price, opinet_station, consumption_index,
                        airbridge, survey, campaign_master)
from data.synthetic import (customer, lookalike, transaction_synth,
                             campaign_sms, campaign_aggr, price_synth, seeds,
                             persona, cluster, segment, member, timeslot)

S3_BUCKET = os.environ.get('SYNTHETIC_DATA_BUCKET', 'ontology-gcc-dev-synthetic-data-x')

def upload_ndjson(s3, key: str, items: list, model_dump=True):
    """Stream-encode to bytes via incremental write to bound peak memory."""
    n = len(items)
    # For large item lists, split into multiple S3 objects (helps both memory and Bulk Loader parallelism).
    chunk_size = int(os.environ.get('NDJSON_CHUNK_SIZE', '500000'))
    if n <= chunk_size:
        # Build incrementally (avoid one giant join string)
        from io import BytesIO
        buf = BytesIO()
        for i, o in enumerate(items):
            line = (o.model_dump_json() if model_dump else json.dumps(o, ensure_ascii=False))
            if i:
                buf.write(b'\n')
            buf.write(line.encode('utf-8'))
        body = buf.getvalue()
        s3.put_object(Bucket=S3_BUCKET, Key=key, Body=body)
        print(f'  -> s3://{S3_BUCKET}/{key} ({n} items, {len(body)//1024}KB)')
    else:
        # Multi-part: split into <chunk_size> per file
        base = key.rsplit('.', 1)[0]
        ext = key.rsplit('.', 1)[1] if '.' in key else 'ndjson'
        for ci, start in enumerate(range(0, n, chunk_size)):
            sub = items[start:start+chunk_size]
            from io import BytesIO
            buf = BytesIO()
            for i, o in enumerate(sub):
                line = (o.model_dump_json() if model_dump else json.dumps(o, ensure_ascii=False))
                if i:
                    buf.write(b'\n')
                buf.write(line.encode('utf-8'))
            sub_key = f'{base}.part{ci:04d}.{ext}'
            s3.put_object(Bucket=S3_BUCKET, Key=sub_key, Body=buf.getvalue())
            print(f'  -> s3://{S3_BUCKET}/{sub_key} ({len(sub)} items)')
        print(f'  total {n} items in {(n + chunk_size - 1)//chunk_size} parts under {base}/')

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--raw-dir', default='./raw_data')
    p.add_argument('--neptune', action='store_true', help='Bulk load to Neptune')
    p.add_argument('--opensearch', action='store_true', help='Index to OS')
    p.add_argument('--weather', action='store_true', help='Run KMA ETL')
    p.add_argument('--lookalike-target', type=int, default=50_000)
    args = p.parse_args()

    s3 = boto3.client('s3')
    raw = Path(args.raw_dir)

    print('=== Phase 1: real adapters ===')
    cf = coupon_fact.load(str(raw / '1.tb_sm_cmpg_ofer_f_쿠폰발급사용내역.csv'))
    cm_meta = campaign_master.load(str(raw / '2.캠페인마스터.csv'))
    txs = transaction.load(str(raw / '3.cust_deal_cntx_intg_주유매출내역.csv'))
    ta = term_agreement.load(str(raw / '4.dw_cu_crd_mast_약관동의내역.csv'))
    fp = opinet_price.load(str(raw / '5.tco017_주유소가격.csv'))
    ci = consumption_index.load(str(raw / '6.현대카드소비지수.csv'))
    stations, regions = opinet_station.load(str(raw / '7.tco016_주유소마스터.csv'))
    aev = airbridge.load(str(raw / '8.에어브릿지수집앱행동데이터.csv'))
    surv = survey.load(str(raw / '9.운전중불편요소설문.csv'))

    # Campaign meta enrichment
    enriched_campaigns = [cm_meta.get(c.campaign_cd, c) for c in cf['campaigns']]

    # cohort 분류 (D14)
    coupon_ids   = {u.cust_id for u in cf['coupon_uses']}
    sales_ids    = {t.cust_id for t in txs}
    deep_history = coupon_ids & sales_ids
    coupon_only  = coupon_ids - sales_ids
    sales_only   = sales_ids - coupon_ids
    print(f'  cohort: deep={len(deep_history)} coupon-only={len(coupon_only)} sales-only={len(sales_only)}')

    # real customers
    real_customers = []
    cust_real_attrs = {}   # cust_id → (gender, age) from txs (mode)
    for t in txs:
        cust_real_attrs.setdefault(t.cust_id, [])

    for cid in deep_history:
        real_customers.append(customer.enrich_customer_attributes(cid, 'deep-history'))
    for cid in coupon_only:
        real_customers.append(customer.enrich_customer_attributes(cid, 'coupon-only'))
    for cid in sales_only:
        real_customers.append(customer.enrich_customer_attributes(cid, 'sales-only'))

    print('=== Phase 2: synthetic ===')
    look_customers, look_txs = lookalike.expand_to_lookalike(txs, target_count=args.lookalike_target)
    syn_txs = transaction_synth.generate_for_coupon_only(list(coupon_only))
    pm_m_txs = seeds.inject_pm_m_92ron_pattern([c.cust_id for c in look_customers], target=250)
    d2p_txs = seeds.inject_diesel_to_premium_transition([c.cust_id for c in look_customers][250:], target=250)

    all_customers = real_customers + look_customers
    all_txs = txs + syn_txs + look_txs + pm_m_txs + d2p_txs

    # campaigns·sms·aggregation
    campaign_codes = [c.campaign_cd for c in enriched_campaigns]
    target_cust = [c.cust_id for c in all_customers]
    sms = campaign_sms.generate_sms_for_campaigns(campaign_codes, target_cust)
    aggr = campaign_aggr.aggregate_from_facts(cf['coupons'], cf['coupon_uses'], sms)

    # synthetic price (days reduced to keep memory bounded under Fargate task)
    syn_price_days = int(os.environ.get('SYN_PRICE_DAYS', '30'))
    syn_prices = price_synth.generate_yearly_for_stations(stations, days=syn_price_days)
    all_prices = fp + syn_prices

    # supporting
    pers = persona.get_personas()
    cl_init = cluster.get_initial_clusters()
    seg_init = segment.get_initial_segments()
    mem = member.members_for(all_customers)
    ts_init = timeslot.get_timeslots()

    print('=== Phase 3: upload to S3 (NDJSON) ===')
    import gc
    upload_ndjson(s3, 'nodes/transaction/all.ndjson', all_txs)
    del all_txs, syn_txs, look_txs, pm_m_txs, d2p_txs, txs; gc.collect()
    upload_ndjson(s3, 'nodes/fuel_price/all.ndjson', all_prices)
    del all_prices, syn_prices, fp; gc.collect()
    # Capture a small sample for OpenSearch before freeing the big customer list
    customers_sample_for_os = all_customers[:1000]
    upload_ndjson(s3, 'nodes/customer/all.ndjson', all_customers)
    del all_customers, look_customers, real_customers; gc.collect()
    upload_ndjson(s3, 'nodes/app_event/all.ndjson', aev); del aev; gc.collect()
    upload_ndjson(s3, 'nodes/campaign/all.ndjson', enriched_campaigns)
    upload_ndjson(s3, 'nodes/coupon/all.ndjson', cf['coupons'])
    upload_ndjson(s3, 'nodes/coupon_use/all.ndjson', cf['coupon_uses'])
    upload_ndjson(s3, 'nodes/offer/all.ndjson', cf['offers'])
    upload_ndjson(s3, 'nodes/term/all.ndjson', ta['terms'])
    upload_ndjson(s3, 'nodes/term_agreement/all.ndjson', ta['agreements'])
    upload_ndjson(s3, 'nodes/gas_station/all.ndjson', stations)
    upload_ndjson(s3, 'nodes/region/all.ndjson', regions)
    upload_ndjson(s3, 'nodes/consumption_index/all.ndjson', ci)
    upload_ndjson(s3, 'nodes/survey/all.ndjson', surv)
    upload_ndjson(s3, 'nodes/persona/all.ndjson', pers)
    upload_ndjson(s3, 'nodes/cluster/all.ndjson', cl_init)
    upload_ndjson(s3, 'nodes/segment/all.ndjson', seg_init)
    upload_ndjson(s3, 'nodes/member/all.ndjson', mem)
    upload_ndjson(s3, 'nodes/timeslot/all.ndjson', ts_init)
    upload_ndjson(s3, 'nodes/campaign_sms/all.ndjson', sms)
    upload_ndjson(s3, 'nodes/campaign_aggregation/all.ndjson', aggr)
    del cf, ta, stations, regions, ci, surv, sms, aggr; gc.collect()

    if args.weather:
        from data.external.run_etl import run as run_kma
        n = run_kma(start_date='20260501', days=7)
        print(f'  weather observations: {n}')

    if args.neptune:
        from data.loader.bulk_neptune import submit, poll
        load_id = submit(f's3://{S3_BUCKET}/nodes/', fmt='opencypher')
        print(f'  loadId={load_id}')
        result = poll(load_id, timeout_min=30)
        print(f'  Neptune load complete: {result}')

    if args.opensearch:
        from data.loader.opensearch_index import ensure_index, bulk_index
        ensure_index()
        sample = customers_sample_for_os
        docs = [{'doc_id': c.cust_id, 'class_name': 'Customer',
                 'text': f'{c.gender_cd} {c.age_section_cd} {c.sido_nm}', 'metadata': c.model_dump()}
                for c in sample]
        bulk_index(docs)
        print(f'  OS indexed {len(docs)} customer samples')

    print('done')

if __name__ == '__main__':
    main()
