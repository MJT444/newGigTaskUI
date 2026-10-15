const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);

const result = db.GigReviews.aggregate([
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
                {
                    $group: {
                        _id: "$freelancer_id",
                        avg_rating: { $avg: "$rating" },
                        review_count: { $sum: 1 }
                    }
                },
                { $sort: { avg_rating: -1, review_count: -1 } },
                { $limit: 10 },
                {
                    $project: {
                        _id: 1,
                        avg_rating: { $round: ["$avg_rating", 2] },
                        review_count: 1
                    }
                }
            ]
        }
    }
]).toArray();

printjson(result);
