#!/usr/bin/env python3
"""
Generate a 30,000-row Philippine automotive spare-parts sales dataset.

The output follows the same column format as the existing sales.csv file:
date,order_number,product_name,category,customer_type,quantity,unit_price,total_amount,payment_method

The monthly demand signal is intentionally mixed across:
  - smooth
  - erratic
  - intermittent
  - lumpy

That allows downstream ADI/CV2 classification to route products into both
ARIMA_XGB and TSB_XGB pipelines.
"""

import calendar
import argparse
import csv
import math
import random
from datetime import datetime
from pathlib import Path

ADI_THRESH = 1.32
CV2_THRESH = 0.49
START_DATE = datetime(2021, 1, 1)
END_DATE = datetime(2025, 12, 31)
TARGET_ROWS = 30000

CUSTOMER_TYPES = ["Retail", "Wholesale"]
PAYMENT_METHODS = ["Cash", "GCash", "Maya", "Bank Transfer", "Check"]

PRODUCTS = [
    {"product_name": "Oil Filter", "category": "Engine system", "price_range": (140, 260), "demand_type": "smooth"},
    {"product_name": "Air Filter", "category": "Engine system", "price_range": (220, 360), "demand_type": "smooth"},
    {"product_name": "Brake Pads", "category": "Braking system", "price_range": (950, 1600), "demand_type": "smooth"},
    {"product_name": "Shock Absorber", "category": "Suspension & traction", "price_range": (2400, 4200), "demand_type": "erratic"},
    {"product_name": "Wheel Bearing", "category": "Drivetrain", "price_range": (1600, 2900), "demand_type": "erratic"},
    {"product_name": "Battery", "category": "Electrical system", "price_range": (4200, 7800), "demand_type": "intermittent"},
    {"product_name": "Alternator", "category": "Electrical system", "price_range": (6800, 12500), "demand_type": "intermittent"},
    {"product_name": "Starter Motor", "category": "Electrical system", "price_range": (6200, 11800), "demand_type": "intermittent"},
    {"product_name": "Catalytic Converter", "category": "Exhaust system", "price_range": (12000, 24000), "demand_type": "lumpy"},
    {"product_name": "ECU Module", "category": "Electrical system", "price_range": (14500, 28500), "demand_type": "lumpy"},
]


def classify_demand(quantities):
    arr = [float(q) for q in quantities]
    n = len(arr)
    non_zero = [q for q in arr if q > 0]
    if not non_zero:
        return {
            "adi": float("inf"),
            "cv2": 0.0,
            "demand_type": "INTERMITTENT",
            "algorithm": "TSB_XGB",
        }

    adi = n / len(non_zero)
    mean_non_zero = sum(non_zero) / len(non_zero)
    std_non_zero = math.sqrt(sum((q - mean_non_zero) ** 2 for q in non_zero) / max(len(non_zero) - 1, 1))
    cv2 = (std_non_zero / mean_non_zero) ** 2 if mean_non_zero > 0 else 0.0

    high_adi = adi >= ADI_THRESH
    high_cv2 = cv2 >= CV2_THRESH
    if not high_adi and not high_cv2:
        demand_type, algorithm = "SMOOTH", "ARIMA_XGB"
    elif not high_adi and high_cv2:
        demand_type, algorithm = "ERRATIC", "ARIMA_XGB"
    elif high_adi and not high_cv2:
        demand_type, algorithm = "INTERMITTENT", "TSB_XGB"
    else:
        demand_type, algorithm = "LUMPY", "TSB_XGB"

    return {
        "adi": round(adi, 4),
        "cv2": round(cv2, 4),
        "demand_type": demand_type,
        "algorithm": algorithm,
    }


def month_starts(start_date, end_date):
    months = []
    cursor = datetime(start_date.year, start_date.month, 1)
    end_marker = datetime(end_date.year, end_date.month, 1)
    while cursor <= end_marker:
        months.append(cursor)
        if cursor.month == 12:
            cursor = datetime(cursor.year + 1, 1, 1)
        else:
            cursor = datetime(cursor.year, cursor.month + 1, 1)
    return months


def clamp_int(value, minimum):
    return max(minimum, int(round(value)))


def generate_monthly_series(profile_name, periods):
    if profile_name == "smooth":
        base = random.randint(95, 180)
        volatility = random.uniform(0.07, 0.16)
        quantities = []
        for _ in range(periods):
            noise = random.gauss(0, base * volatility)
            quantities.append(clamp_int(base + noise, 25))
        return quantities

    if profile_name == "erratic":
        base = random.randint(65, 140)
        quantities = []
        for _ in range(periods):
            if random.random() < 0.18:
                qty = random.randint(base * 2, base * 4)
            elif random.random() < 0.20:
                qty = random.randint(8, max(12, base // 3))
            else:
                noise = random.gauss(0, base * random.uniform(0.45, 0.7))
                qty = clamp_int(base + noise, 6)
            quantities.append(qty)
        return quantities

    if profile_name == "intermittent":
        base = random.randint(45, 85)
        active_months = random.randint(24, 38)
        active_indices = set(random.sample(range(periods), active_months))
        quantities = []
        for index in range(periods):
            if index not in active_indices:
                quantities.append(0)
                continue
            noise = random.gauss(0, base * random.uniform(0.08, 0.18))
            quantities.append(clamp_int(base + noise, 18))
        return quantities

    if profile_name == "lumpy":
        base = random.randint(35, 80)
        active_months = random.randint(16, 28)
        active_indices = set(random.sample(range(periods), active_months))
        quantities = []
        for index in range(periods):
            if index not in active_indices:
                quantities.append(0)
                continue
            if random.random() < 0.45:
                qty = random.randint(base * 3, base * 7)
            else:
                qty = random.randint(4, max(10, base // 2))
            quantities.append(qty)
        return quantities

    raise ValueError(f"Unknown demand profile: {profile_name}")


def split_quantity(total_quantity, parts):
    if parts <= 1:
        return [total_quantity]

    remaining = total_quantity
    chunks = []
    for slots_left in range(parts, 1, -1):
        max_piece = remaining - (slots_left - 1)
        target = remaining / slots_left
        piece = clamp_int(random.gauss(target, max(1, target * 0.35)), 1)
        piece = min(piece, max_piece)
        chunks.append(piece)
        remaining -= piece

    chunks.append(remaining)
    random.shuffle(chunks)
    return chunks


def distribute_extra_rows(active_months, extra_rows):
    for item in active_months:
        item["extra_rows"] = 0
        item["capacity"] = max(0, item["quantity"] - 1)

    total_weight = sum(item["quantity"] for item in active_months)
    allocated = 0
    for item in active_months:
        share = int(extra_rows * item["quantity"] / total_weight)
        item["extra_rows"] = min(item["capacity"], share)
        allocated += item["extra_rows"]

    remaining = extra_rows - allocated
    eligible = sorted(active_months, key=lambda item: item["capacity"] - item["extra_rows"], reverse=True)
    index = 0
    while remaining > 0 and eligible:
        item = eligible[index % len(eligible)]
        available = item["capacity"] - item["extra_rows"]
        if available > 0:
            item["extra_rows"] += 1
            remaining -= 1
        index += 1


def build_row(date_value, order_number, product_name, category, quantity, unit_price):
    return {
        "date": date_value.strftime("%Y-%m-%d"),
        "order_number": order_number,
        "product_name": product_name,
        "category": category,
        "customer_type": random.choice(CUSTOMER_TYPES),
        "quantity": quantity,
        "unit_price": unit_price,
        "total_amount": round(quantity * unit_price, 2),
        "payment_method": random.choice(PAYMENT_METHODS),
    }


def generate_sales_records(output_file, target_rows=TARGET_ROWS, seed=20260505):
    random.seed(seed)
    months = month_starts(START_DATE, END_DATE)
    periods = len(months)
    baseline_rows = len(PRODUCTS) * periods
    if target_rows < baseline_rows:
        raise ValueError(f"target_rows must be >= {baseline_rows}, got {target_rows}")

    product_series = []
    active_months = []
    for product in PRODUCTS:
        monthly_quantities = generate_monthly_series(product["demand_type"], periods)
        product_entry = {"product": product, "monthly_quantities": monthly_quantities}
        product_series.append(product_entry)
        for month_index, quantity in enumerate(monthly_quantities):
            if quantity > 0:
                active_months.append(
                    {
                        "product": product,
                        "month_index": month_index,
                        "quantity": quantity,
                    }
                )

    extra_rows = target_rows - baseline_rows
    distribute_extra_rows(active_months, extra_rows)

    extra_row_lookup = {}
    for item in active_months:
        key = (item["product"]["product_name"], item["month_index"])
        extra_row_lookup[key] = item["extra_rows"]

    rows = []
    order_counter = 1
    print(f"Generating {target_rows} Philippine spare-parts sales rows")
    for entry in product_series:
        product = entry["product"]
        product_name = product["product_name"]
        category = product["category"]
        min_price, max_price = product["price_range"]
        monthly_quantities = entry["monthly_quantities"]
        classification = classify_demand(monthly_quantities)
        print(
            f"  {product_name}: target={product['demand_type'].upper()} "
            f"classified={classification['demand_type']} "
            f"algorithm={classification['algorithm']} "
            f"ADI={classification['adi']} CV2={classification['cv2']}"
        )

        for month_index, month_start in enumerate(months):
            quantity = monthly_quantities[month_index]
            rows_for_month = 1 if quantity == 0 else 1 + extra_row_lookup[(product_name, month_index)]
            month_days = calendar.monthrange(month_start.year, month_start.month)[1]

            if quantity == 0:
                unit_price = round(random.uniform(min_price, max_price), 2)
                rows.append(
                    {
                        "date": month_start.strftime("%Y-%m-%d"),
                        "order_number": f"ORD{order_counter:06d}",
                        "product_name": product_name,
                        "category": category,
                        "customer_type": random.choice(CUSTOMER_TYPES),
                        "quantity": 0,
                        "unit_price": unit_price,
                        "total_amount": 0.0,
                        "payment_method": random.choice(PAYMENT_METHODS),
                    }
                )
                order_counter += 1
                continue

            for transaction_quantity in split_quantity(quantity, rows_for_month):
                day = random.randint(1, month_days)
                row_date = datetime(month_start.year, month_start.month, day)
                unit_price = round(random.uniform(min_price, max_price), 2)
                rows.append(
                    build_row(
                        row_date,
                        f"ORD{order_counter:06d}",
                        product_name,
                        category,
                        transaction_quantity,
                        unit_price,
                    )
                )
                order_counter += 1

    if len(rows) != target_rows:
        raise RuntimeError(f"Expected {target_rows} rows, generated {len(rows)} rows")

    rows.sort(key=lambda row: (row["date"], row["product_name"], row["order_number"]))

    with open(output_file, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "date",
                "order_number",
                "product_name",
                "category",
                "customer_type",
                "quantity",
                "unit_price",
                "total_amount",
                "payment_method",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"Generated {len(rows)} rows")
    print(f"Saved to {output_file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate Philippine automotive spare-parts sales CSV data.")
    parser.add_argument("--rows", type=int, default=TARGET_ROWS, help="Number of rows to generate.")
    parser.add_argument(
        "--output",
        type=str,
        default=str(Path(__file__).parent / "sales_30000_philippines_mixed.csv"),
        help="Output CSV path.",
    )
    parser.add_argument("--seed", type=int, default=20260505, help="Random seed.")
    args = parser.parse_args()

    generate_sales_records(args.output, target_rows=args.rows, seed=args.seed)
