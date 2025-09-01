# blockchain-fileupload
# Hardhat
npx hardhat node
npx hardhat compile 
npx hardhat run scripts/deploy.js --network localhost

# Python from backend directory
python -m venv venv
source venv\Scripts\activate
pip install -r requirements.txt

# Run backend API from backend directory
uvicorn main:app --reload

# Python command for DB
python event_listener.py

# npm from Dapp
npm install 
npm start

