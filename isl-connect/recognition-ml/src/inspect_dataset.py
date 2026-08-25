from datasets import load_dataset

ds = load_dataset("ai4bharat/INCLUDE")

print(ds["train"].cache_files)