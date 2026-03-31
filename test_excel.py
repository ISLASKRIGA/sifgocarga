import pandas as pd

file = r"c:\Users\chuch\.gemini\antigravity\playground\sifgocarga\data\Salidas_1enero_1_14_20260120 (2).xlsx"
xl = pd.ExcelFile(file)
print("Sheets:", xl.sheet_names)

for sheet in xl.sheet_names:
    print(f"\n--- Sheet: {sheet} ---")
    df = pd.read_excel(xl, sheet_name=sheet, header=None, nrows=10)
    print(df.to_string())
