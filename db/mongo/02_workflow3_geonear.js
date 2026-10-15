const jobSite = { type: "Point", coordinates: [77.2090, 28.6139] };

const result = db.WorkerLocations.aggregate([
    {
        $geoNear: {
            near: jobSite,
            distanceField: "distance_meters",
            spherical: true,
            query: { is_available: true }
        }
    },
    { $limit: 5 },
    {
        $project: {
            _id: 0,
            freelancer_id: 1,
            distance_meters: { $round: ["$distance_meters", 1] },
            location: 1,
            created_at: 1
        }
    }
]).toArray();

printjson(result);
