from data.schemas import Cluster


def get_initial_clusters() -> list[Cluster]:
    labels = ['충전형', '출퇴근형', '장거리', '도심집중', '고급선호', '디젤전환']
    return [Cluster(cluster_id=f'cl-{i+1}', label=l, centroid={}) for i, l in enumerate(labels)]
