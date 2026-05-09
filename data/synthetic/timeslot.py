from data.schemas import TimeSlot


def get_timeslots() -> list[TimeSlot]:
    return [
        TimeSlot(slot_id='commute_morning', label_kr='출근', hour_start=6, hour_end=9, weekend_yn='N'),
        TimeSlot(slot_id='lunch',          label_kr='점심', hour_start=11, hour_end=14, weekend_yn='N'),
        TimeSlot(slot_id='commute_evening', label_kr='퇴근', hour_start=17, hour_end=20, weekend_yn='N'),
        TimeSlot(slot_id='late_night',     label_kr='심야', hour_start=21, hour_end=5, weekend_yn='*'),
        TimeSlot(slot_id='weekend',        label_kr='주말', hour_start=0, hour_end=23, weekend_yn='Y'),
    ]
