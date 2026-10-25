# Devpost submission: Common Ground

Copy each section into the matching field on the Devpost form.

---

## Project name

Common Ground

## Elevator pitch (200 characters max)

An agent that plans a night out for friends whose tastes clash. Qloo scores every option for every person, so the plan is fair to all of you, and every claim comes with a receipt.

## Try it out

- Live app: https://common-ground-puce.vercel.app
- Code: https://github.com/pswapnajit/common-ground

## Built with

typescript, react, vite, node.js, qloo-insights-api, claude, anthropic-sdk, vercel, vitest

---

## About the project

### Inspiration

Every group chat has the same argument. Where should we eat? What should we watch? Recommendation apps are built for one person, so groups fall back on the most popular option, and the same friend keeps quietly going along with it. Swipe-to-match apps make everyone vote on fifty options. We wanted something that already knows what each person likes and can find the place where those tastes meet, even when nobody's lists overlap.

### What it does

You add 2 to 6 people and a few things each of them loves: films, shows, artists, books, restaurants, games, travel. You pick what you're planning (dinner, drinks, a movie, a series, music, a book, a weekend trip), say where, and add any notes like "one vegetarian, nothing too pricey".

The agent then:

1. Reads each person's taste fingerprint from Qloo and shows where the group's tastes meet and where they pull apart.
2. Builds a shortlist for each item from everyone's favourites, scores the same shortlist separately for every person, and ranks it so nobody ends up near the bottom of their own list.
3. Publishes a plan. Each pick shows every person's predicted fit, whose favourites pulled it up, who gives up the most compared with their own number one, and how the most popular option would have treated the group.
4. Takes follow-ups in plain English ("no horror", "somewhere cheaper", "Jun hates sushi") or a tap on **Not this one**, then re-plans only what changed. Asked for "No horror, please", it looks up Qloo's Horror tag, re-plans only the movie with that tag excluded, and leaves dinner alone.

When the group accepts a plan, a fairness ledger in the browser remembers how well it fit each person. Whoever compromised most gets a slightly bigger say next time.

Every Qloo request behind a plan is listed in a receipts drawer: endpoint, parameters, result count and timing.

### What makes it Qloo-powered

The app does not work without Qloo. Qloo supplies three things a language model can't:

- **Overlap across categories.** Three friends rarely list the same film. Qloo's graph links a horror fan, a Taylor Swift fan and a natural-wine fan through real audiences, so it can name a restaurant or a film all three are predicted to enjoy.
- **A score for each person on the same shortlist.** We call `/v2/insights` once per person with `filter.results.entities` set to the shared shortlist and that person's favourites as signals. That is the number the fairness step needs.
- **Evidence.** `feature.explainability` says which input favourites pulled each recommendation up, so the app can credit picks to people ("Qloo ties it most to Priya's love of Fleabag and Marco's Metallica") instead of inventing reasons.

Endpoints used in one product flow: `/search` (typeahead), `/v2/tags` (category tags and constraints from notes), `/v2/insights` for entities (with explainability, tags, location, price, content-rating and exclusion filters), `/v2/insights` scoring a fixed shortlist, `/v2/insights` with `filter.type=urn:tag` and `filter.results.tags` (taste fingerprints), and `/v2/analysis/compare` (two-person groups).

### How we built it

- **Agent:** a tool-use loop on the Anthropic SDK with Claude Opus 5.5. Four tools: `read_group_taste`, `find_qloo_tags`, `plan_slot` and `finalize_plan`. The server checks every pick against the scored shortlist, so the model can't invent a restaurant. The model provider is pluggable (any OpenAI-compatible API works). If the model is unavailable, a rule-based planner runs the same tools, so the demo never breaks; the top bar shows which mode is running.
- **Fairness:** Qloo affinity scores from separate requests aren't on a common scale, so each person's scores are turned into percentiles within the shared shortlist. Options below a misery floor for anyone are dropped (the "average without misery" strategy from group-recommender research). The rest are ranked by a weighted geometric mean, so one unhappy person counts for more than a plain average would allow.
- **App:** React and Vite in the browser, web-standard request handlers on Vercel functions, results streamed to the page as the agent works. The interface follows Apple's Human Interface Guidelines: system font and type scale, inset grouped lists, system colours, and light and dark appearance.
- **Development without a key:** a synthetic mock of the Qloo API answers the same requests in the same response shapes, so we could build and test before our key arrived. Switching to live is one environment variable.
- **Tests:** the fairness maths, the Qloo client and normaliser, the mock API, the planner and the agent loop (with a scripted model) are covered by a Vitest suite.

### Challenges we ran into

- **Comparing people fairly.** Raw affinity scores from different requests can't be compared, so averaging them would quietly favour whoever's request happened to score higher. Rank-normalising within one shared shortlist fixed that.
- **Keeping the agent honest.** Language models like to add detail. We limited the agent to facts the tools return (percentiles, credit, shared tags) and made the server reject picks that weren't scored.
- **Real data is messier than the docs.** Taste analysis without `filter.parents.types` returned place attributes ("Three Star", "Inexpensive") all scored 1.0. A search in "Brooklyn" also returned Lower Manhattan, because Qloo pads a locality's edge unless `filter.location.radius=0`. And the "restaurant" tag covered cafes, bakeries and a shopping mall, so dinner now ORs 36 cuisine genres and checks each place's `primary_genre`.
- **Speed.** A plan for three people takes about 20 Qloo requests. They run in parallel, identical requests are de-duplicated, and results are cached in server memory. Scoring film shortlists is the slowest part, so those shortlists are capped at 32 options. On the hosted demo the Claude agent usually returns a fresh two-item plan in 15 to 30 seconds and a follow-up in about 15; the Qloo work is a few seconds of that when Qloo is responsive.

### Accomplishments that we're proud of

- A plan that explains itself: who each pick is for, who gives up what, and the Qloo request behind every number.
- Picks that hold up against the obvious alternative. In the roommates sample, the most popular film on the shortlist, Joker, is Marco's number one but sits in the bottom 7% for Priya and the bottom 3% for Jun. The fair pick, Little Women, is in all three people's top half.
- The fairness ledger. Groups make plans together again and again, and the same person often ends up compromising. The ledger evens that out over time.

### What we learned

Taste overlap is rarely where you'd look first. The horror fan and the rom-com fan in our sample group don't share a genre, but Qloo's taste analysis finds that all three roommates lean towards stories about inner struggle and self-reflection, and it scores a vegetarian place in Williamsburg in all three people's top 18% for dinner. That's the part of the problem a taste graph solves and a chatbot can't.

### What's next

- Invite links, so each friend adds their own favourites from their phone.
- Booking and ticketing hand-offs (reservations, showtimes, concert tickets) once a plan is accepted.
- A "where should we meet?" step using Qloo heatmaps, to pick the neighbourhood that suits the whole group.

---

## Testing instructions for judges

No login is needed. Open the live app and click any sample group, for example **Roommates, Friday night**. To build your own group, edit the names, use the search box to add favourites from Qloo, choose what to plan and press **Find our common ground**. Try a follow-up in the chat box, press **Not this one** on a pick, or open **Qloo receipts** to see the requests.
