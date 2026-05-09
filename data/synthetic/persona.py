from data.schemas import Persona


def get_personas() -> list[Persona]:
    return [
        Persona(persona_id='marketing',  name_kr='마케팅',         kpi_focus=['conversion', 'roas', 'reach']),
        Persona(persona_id='strategy',   name_kr='고객전략',       kpi_focus=['retention', 'clv', 'segment_size']),
        Persona(persona_id='data-ai',    name_kr='데이터·AI',     kpi_focus=['cluster_quality', 'model_lift']),
        Persona(persona_id='crm',        name_kr='CRM·회원사업',  kpi_focus=['member_active', 'points_earned']),
        Persona(persona_id='retail-ops', name_kr='리테일영업',     kpi_focus=['station_volume', 'margin', 'self_rate']),
    ]
