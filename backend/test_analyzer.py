# Test anomaly detection with a dataset that has an obvious spike
trend_data = {
    "amount_by_date_month": [
        {"period": "2024-01", "total": 10000},
        {"period": "2024-02", "total": 11000},
        {"period": "2024-03", "total": 10500},
        {"period": "2024-04", "total": 45000},  # obvious spike
        {"period": "2024-05", "total": 10800},
    ]
}

from analyzer import detect_anomalies
print(detect_anomalies(trend_data))

from analyzer import generate_ai_insights

breakdowns = {"amount_by_department": {"IT": 27500, "Ops": 3200, "Finance": 8000}}
monthly_trend = {"amount_by_date_month": [
    {"period": "2024-01", "total": 10000},
    {"period": "2024-02", "total": 11000},
    {"period": "2024-03", "total": 10500},
    {"period": "2024-04", "total": 45000},
    {"period": "2024-05", "total": 10800},
]}
anomalies = [{"field": "amount_by_date_month", "period": "2024-04", "value": 45000, "average": 17460.0, "direction": "spike", "z_score": 2.0}]

result = generate_ai_insights(breakdowns, monthly_trend, anomalies)
for insight in result:
    print(insight)