# Common Ground

**An agent that plans a night out your whole group will enjoy.** Add your people and a few things each of them loves (films, shows, music, books, places). Common Ground uses [Qloo](https://qloo.com)'s taste graph to find where those tastes overlap, scores every option separately for every person, and picks the one that's fair to all of you. Every claim it makes comes with the Qloo request behind it.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/).

- **Live demo:** https://common-ground-puce.vercel.app
- **Submission text:** [submission/DEVPOST.md](submission/DEVPOST.md)
- **Why this idea:** [IDEA.md](IDEA.md)

## Try it in 30 seconds

1. Open the [live demo](https://common-ground-puce.vercel.app).
2. Click **Roommates, Friday night** (or any sample group). The agent reads each person's taste, plans dinner and a movie, and shows how well each pick fits each person.
3. Type a change in the chat box (try *"No horror, please"* or *"Somewhere cheaper"*), press **Not this one** on a pick, or open **Qloo receipts** to see every API request it made.

## Run it locally

```bash
git clone https://github.com/pswapnajit/common-ground.git && cd common-ground
npm install
npm start          # builds the UI and serves everything on http://localhost:8787
```

It runs with no keys at all: without `QLOO_API_KEY` it uses a small **synthetic** mock of the Qloo API, and without a model key it uses a rule-based planner. To go live, copy `.env.example` to `.env` and set:

| Variable | What it does |
|---|---|
| `QLOO_API_KEY` | Your Qloo hackathon key. Setting it is the only change needed to switch from the mock to the live API. |
| `ANTHROPIC_API_KEY` | Turns on the Claude agent (default model `claude-opus-5-5`, set with `LLM_MODEL`). |
| `LLM_PROVIDER` | `anthropic` (default), `openai` for any OpenAI-compatible API (with `LLM_BASE_URL`, `LLM_MODEL`, `OPENAI_API_KEY`), or `offline`. |

`npm run dev` starts Vite with hot reload plus the API server. `npm test` runs the test suite. `npm run smoke:live` checks every Qloo endpoint the app uses against the live API.

## Why it needs Qloo

The contest rule is blunt: "If your submission would work the same without Qloo, you're building the wrong thing." Here is what Common Ground gets from Qloo that a language model can't supply on its own:

1. **Overlap across categories.** Friends rarely list the same film. One loves horror and metal, one loves Taylor Swift and rom-coms. Qloo's graph links tastes through real audiences, so it can find a restaurant or a movie that both are predicted to like, even when their lists share nothing.
2. **A number for each person.** Fairness needs "how much will Marco like this?" for every option and every person. Qloo returns that affinity when you score a fixed shortlist (`filter.results.entities`) with one person's favourites as signals.
3. **Evidence.** `feature.explainability` says which input favourites pulled each recommendation up, so the app can show whose taste a pick came from instead of making it up.

Take Qloo away and there are no candidates, no per-person scores and no evidence: what's left is a chatbot guessing.

## How it works

```
favourites ──▶ /search ──▶ Qloo entity ids
                              │
   ┌──────────────────────────┼─────────────────────────────┐
   ▼                          ▼                             ▼
taste fingerprints      candidates                    per-person scores
/v2/insights            /v2/insights                  /v2/insights
filter.type=urn:tag     everyone's ids as signals     filter.results.entities =
filter.results.tags     + feature.explainability      the shared shortlist,
/v2/analysis/compare    + one request per person      one request per person
   │                          │                             │
   └──────────── shared and tension tags                    ▼
                              │                 percentiles within the shortlist
                              ▼                             │
                    agent (Claude) ◀── fair ranking: misery floor, then
                    picks, explains,     weighted geometric mean (ledger weights)
                    re-plans on request
```

**The fairness maths** ([server/engine/fairness.ts](server/engine/fairness.ts)):

- Qloo affinity scores from separate requests aren't on a common scale, so each person's scores become **percentiles within one shared shortlist** before anything is combined.
- A **misery floor** drops options that leave anyone near the bottom of their own list (the "average without misery" strategy from group-recommender research). The floor starts at the 40th percentile and is lowered only if fewer than three options pass.
- The rest are ranked by the **weighted geometric mean** of percentiles ("multiplicative" aggregation), so one unhappy person pulls a score down much more than a plain average would.
- A **fairness ledger** remembers how well past plans you accepted fit each person. Whoever compromised most gets a slightly larger weight next time (between 0.75× and 1.5×).
- Each pick is compared with **the most popular option** on the shortlist, which is what groups often fall back on, and with **each person's own number one**, so the trade-off is spelled out.

**The agent** ([server/agent](server/agent)) is a tool-use loop with four tools:

| Tool | What it does |
|---|---|
| `read_group_taste` | Taste fingerprints, shared tags and tension tags for the group. |
| `find_qloo_tags` | Turns the group's notes ("vegetarian", "rooftop", "no horror") into Qloo tag ids via `/v2/tags`. |
| `plan_slot` | Runs the candidate → per-person scoring → fair-ranking pipeline for one item (dinner, drinks, movie, series, music, book, weekend trip), with filters for tags, price, content rating and year. |
| `finalize_plan` | Publishes the plan. The server rejects any pick that isn't on the scored shortlist, so the model can't invent a restaurant. |

The default model is Claude Opus 5.5 through the official Anthropic SDK (adaptive thinking, `effort: low` for speed, prompt caching, server-side refusal fallback). Any OpenAI-compatible model works too. If no model is configured, or the model API fails mid-run, a rule-based planner calls the same tools so the demo keeps working: it maps common requests (cheaper, vegetarian, rooftop, outdoor seating, live music, no horror, kid-friendly) to Qloo filters and says which ones it applied. The top bar always shows which mode is running.

## Qloo endpoints used

| Endpoint | Parameters that matter | Used for |
|---|---|---|
| `GET /search` | `query`, `types` | Typeahead for favourites |
| `GET /v2/tags` | `filter.query`, `feature.semantic_search` | Category tags (restaurant, bar) and constraints from notes |
| `GET /v2/insights` | `filter.type=urn:entity:*`, `signal.interests.entities`, `feature.explainability`, `filter.tags` + `operator.filter.tags`, `filter.exclude.tags`, `filter.location.query` + `filter.location.radius`, `filter.price_level.*`, `filter.content_rating`, `filter.exclude.entities` | Candidate shortlists |
| `GET /v2/insights` | `filter.results.entities` + one person's signals | Each person's score for every shortlisted option |
| `GET /v2/insights` | `filter.type=urn:tag`, `filter.parents.types`, `diversify.by=subtype`, `filter.results.tags` | Taste fingerprints and the person × tag matrix |
| `GET /v2/analysis/compare` | `a.signal.interests.entities`, `b.signal.interests.entities` | Shared tags for two-person groups |

A two-item plan for three people makes about 20 Qloo requests, run in parallel where possible and cached in server memory. On the hosted demo the Claude agent usually returns a fresh two-item plan in 15 to 30 seconds (three model turns plus the Qloo work) and a follow-up in about 15. Qloo's hackathon API is occasionally much slower, so functions may run for up to 300 seconds and the page says when it is still working. The Qloo part alone takes about 4 seconds, which is also how long the built-in planner takes when no model key is set. Repeat Qloo requests come from the cache.

### What the live data taught us

- **Taste analysis needs scoping.** `filter.type=urn:tag` on its own returns place attributes ("Three Star", "Inexpensive") all scored 1.0. Adding `filter.parents.types` for films, TV, music and books gives descriptors people recognise ("Confessional", "Darkly Humorous", "Horror Aficionados").
- **Localities are padded.** `filter.location.query=Brooklyn` also returns Lower Manhattan, because Qloo widens a locality's edge by default. The planner asks with `filter.location.radius=0` first and widens only when the area is sparse, and it says so.
- **"Restaurant" is a broad tag.** It covers cafes, bakeries, markets and even a shopping mall. Dinner shortlists OR together 36 cuisine genres, and every place is checked against its `primary_genre` (closed places are dropped too).

## Data handling

- Qloo only ever receives entity ids (and tag ids, filters and locations). People's names stay in the browser and the agent's prompt.
- Live Qloo responses are cached in server memory only. Nothing from Qloo is written to disk or committed; the mock catalogue in [server/qloo/mockData.ts](server/qloo/mockData.ts) is invented, and its restaurants are fictional.
- Predicted fit is an estimate from aggregate taste data. The UI says so, and the agent is told not to present it as fact about a person.

## Deploy

**Vercel (recommended).** The repo includes [vercel.json](vercel.json): Vite builds the UI to `dist/`, and the files in [api/](api) become serverless functions.

```bash
npx vercel deploy --prod
```

Then add `QLOO_API_KEY` and `ANTHROPIC_API_KEY` under Project → Settings → Environment Variables and redeploy. **Render** also works with [render.yaml](render.yaml) (free plan, sleeps when idle).

## Project layout

```
api/                 Vercel functions (plan, search, health)
server/qloo/         Qloo client, normaliser, synthetic mock API
server/engine/       taste analysis, candidate planning, fairness maths
server/agent/        system prompt, tools, model providers, run loop, rule-based fallback
server/http/         request handlers shared by Vercel and the local server
src/                 React UI
tests/               Vitest suite (fairness, client, mock API, planner, agent loop)
scripts/             live smoke test
```

## Limitations

- Qloo's hackathon environment doesn't have equally rich data for every city; place plans work best in large US cities.
- The fairness ledger lives in your browser, not in an account.
- The mock API is a crude imitation for development and tests. Its results say nothing about real tastes.

## License

[MIT](LICENSE)
