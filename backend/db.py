import motor.motor_asyncio
from config import MONGODB_URI, MONGODB_DB_NAME
import asyncio

client = motor.motor_asyncio.AsyncIOMotorClient(MONGODB_URI)
database = client[MONGODB_DB_NAME]
file_events_collection = database.get_collection("file_events")


async def test_mongodb_connection():
    await file_events_collection.insert_one({"test": "connection"})
    doc = await file_events_collection.find_one({"test": "connection"})
    print("MongoDB connection successful:", doc)

if __name__ == "__main__":
    asyncio.run(test_mongodb_connection())