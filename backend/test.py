import hashlib

with open("C:\\Users\\impra\\Documents\\Hackathon_blockchain-project\\package-lock.json", "rb") as f:
    contents = f.read()

print(hashlib.sha256(contents).hexdigest().lower())
