const jobSite = { type: "Point", coordinates: [77.2090, 28.6139] };
const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);

const geoNearExplain = db.WorkerLocations.explain("executionStats").aggregate([
    {
        $geoNear: {
            near: jobSite,
            distanceField: "distance_meters",
            spherical: true,
            query: { is_available: true }
        }
    },
    { $limit: 5 }
]);

const facetExplain = db.GigReviews.explain("executionStats").aggregate([
    { $match: { created_at: { $gte: since } } },
    {
        $facet: {
            ratingDistribution: [
                { $group: { _id: "$rating", count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ],
            topSkillTags: [
                { $unwind: "$skill_tags" },
                { $group: { _id: "$skill_tags", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ],
            overallWorkerRatings: [
                { $group: { _id: "$freelancer_id", avg_rating: { $avg: "$rating" }, review_count: { $sum: 1 } } },
                { $sort: { avg_rating: -1, review_count: -1 } },
                { $limit: 10 }
            ]
        }
    }
]);

print(EJSON.stringify({ workflow3_geonear: geoNearExplain, workflow4_facet: facetExplain }, null, 2));
