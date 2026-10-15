# GigTask preliminary wireframes

**Look:** dark navy headings (`#17233B`), teal actions (`#0D8A83`), light neutral background (`#F6F8FA`), and a system sans-serif font. Reuse buttons, labeled forms, filter bars, status badges, tables, cards, and feedback messages. On phones, side-by-side panels stack vertically and navigation collapses to a menu.

## Shared shell

```text
+--------------------------------------------------------------------+
| GigTask   Browse  Fund Gig  Escrow  Analytics  Nearby  Reviews     |
|                                                  Demo actor [v]    |
+--------------------------------------------------------------------+
| Screen content                                                     |
+--------------------------------------------------------------------+
```

## 1. Browse

```text
+--------------------------------------------------------------------+
| Clients | Freelancers | Contracts                                  |
| Search [____________________]       Status / skill filter [v]      |
|--------------------------------------------------------------------|
| Name / ID              Summary                         View >       |
| Name / ID              Summary                         View >       |
|--------------------------------------------------------------------|
| < Previous                      Page 1 of N              Next >     |
|--------------------------------------------------------------------|
| Detail drawer: record facts, portfolio preview, contract status    |
| [Move to IN_PROGRESS] [Mark COMPLETED] when applicable             |
+--------------------------------------------------------------------+
```

## 2. Fund a gig

```text
+--------------------------------+-----------------------------------+
| Client [v]                     | Escrow before: amount             |
| Freelancer [v]                 | Escrow after: amount              |
| Budget [________]              | Contract: ID, status FUNDED       |
| [Fund gig]                     | New audit entry: amount, time     |
+--------------------------------+-----------------------------------+
| Clear success or specific funding / constraint error               |
+--------------------------------------------------------------------+
```

## 3. Escrow audit

```text
+--------------------------------------------------------------------+
| Client [v]        From [date]        To [date]       [Apply]        |
| Current escrow: amount                                             |
|--------------------------------------------------------------------|
| Date          Action          Change          Running balance       |
| ...           DEBIT           ...             ...                   |
+--------------------------------------------------------------------+
```

## 4. Analytics

```text
+--------------------------------------------------------------------+
| Freelancer [v]       Period [v]        [Refresh lifetime stats]    |
| Last refreshed: date and time                                      |
|--------------------------------------------------------------------|
| Completed contracts        Total earnings       Rank               |
|--------------------------------------------------------------------|
| Seven-day moving-average earnings chart                            |
|--------------------------------------------------------------------|
| Rank           Freelancer              Moving average / earnings   |
+--------------------------------------------------------------------+
```

## 5. Nearby workers

```text
+--------------------------------------------------------------------+
| Job-site origin: [longitude] [latitude]     Radius: 5 km [Search] |
|--------------------------------------------------------------------|
|                                      | Worker   Distance   Ping age  |
|                 MAP                  | ...      0.8 km     now       |
|           job site + workers         | ...      1.6 km     1 min     |
|                                      | Auto-updating                 |
+--------------------------------------------------------------------+
```

## 6. Reviews and portfolio

```text
+--------------------------------------------------------------------+
| Freelancer [v]       Overall average: 4.2      Reviews: 125       |
|--------------------------------------------------------------------|
| Rating distribution chart     | Top skill-tag chart                |
|--------------------------------------------------------------------|
| Portfolio: skills, certifications, experience, bio, hourly rate   |
+--------------------------------------------------------------------+
```

Every screen also needs explicit loading, empty, and error presentations. The numbers above are layout examples, not claims about seeded data.

## Changes made while building

- **Fund a gig** gained a *Start work now* option (on by default). It moves the new contract to `IN_PROGRESS` in the same transaction, so a second active gig is refused by `idx_active_gig` at funding time (see the handover note). Failures show the fix inline: a *Top up* button for insufficient escrow, and the blocking contract with *Mark completed* for a busy freelancer.
- **Escrow audit** shows two balances per row: `balance_after` stored at the time and the running balance computed back from today's balance, with a ✓/✗ per row and a count of matching rows (the inherited seed rows are synthetic and generally don't match; the screen explains this).
- **Analytics** ranking is the Part A query's own output (top 50 freelancer-days, `DENSE_RANK`) with a 30/60/90-day period; clicking a row opens that freelancer's chart.
- **Nearby workers** uses preset job sites plus click-on-map instead of typed coordinates, adds *Workers / Latest pings*, a ping-age filter, *Live* polling and *Add fresh pings*.
- **Reviews** adds a *Top-rated workers* list (the `overallWorkerRatings` facet) that drills into one freelancer, and a review list filtered by clicking a star bar.
- The demo actor is a **client** (“Acting as client”), because clients fund gigs and own the escrow.

Implemented look and components: [design_system.md](design_system.md).
