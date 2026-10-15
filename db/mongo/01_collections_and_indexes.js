db.createCollection("Portfolios");
db.createCollection("GigReviews");
db.createCollection("WorkerLocations");

db.WorkerLocations.createIndex({ location: "2dsphere" });
db.WorkerLocations.createIndex({ created_at: 1 }, { expireAfterSeconds: 7200 });

db.GigReviews.createIndex({ freelancer_id: 1 });
db.GigReviews.createIndex({ created_at: 1 });

print("Collections and indexes created:");
printjson(db.WorkerLocations.getIndexes());
