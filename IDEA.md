# Idea review: Qloo Agentic Hackathon

_Written 2026-10-20. Decision: build **Common Ground**._

## The pick

**Common Ground** is an agent that plans a night out (dinner, a movie, music, a book, a trip) for a group of 2 to 6 people whose tastes don't obviously match. Each person adds a few things they love, in any category. The agent uses Qloo's taste graph to find where those tastes overlap, picks options that are fair to everyone, and explains each trade-off with evidence from Qloo rather than guesses.

Short version: Spotify Blend made group playlists easy. Nobody has done that for food, film, books and travel, because doing it needs a taste graph that crosses categories. Qloo has one.

## What the judges score (all four weighted equally)

| Criterion | How Common Ground answers it |
|---|---|
| Technological implementation: "How thoroughly and skillfully does the project use Qloo?" | Uses 6 Qloo endpoints in one product flow: `/search`, `/v2/tags`, `/v2/insights` for entities (with `feature.explainability`), `/v2/insights` scoring a fixed shortlist (`filter.results.entities`), `/v2/insights` with `filter.type=urn:tag` (taste analysis), and `/v2/analysis/compare`. Every Qloo call is shown to the user as a receipt. |
| Design: "a complete, coherent product experience" | One screen: your people on the left, the plan on the right, an agent you can talk to underneath. Sample groups load in one click. The plan can be copied straight into a group chat. |
| Potential impact: "a credible, specific case for solving a real problem for a real audience" | Group plans are where today's recommenders fail: they are built for one person. Groups default to the most popular option, and the same friend keeps compromising. The demo shows each person's predicted fit for every pick, next to what "just pick the popular place" would have given them. |
| Quality of the idea: "creative, non-obvious use of Qloo … genuine understanding of the problem space" | It uses ideas from group-recommender research (average without misery, multiplicative aggregation, a fairness ledger across repeated plans) and a property of Qloo's data that a casual integration would miss: affinity scores from separate requests aren't comparable, so each person's scores are converted to ranks within one shared shortlist before they are combined. |

The tie-break order is the criteria order above, so technical depth matters most.

## Why it only works with Qloo

The contest rule: "If your submission would work the same without Qloo, you're building the wrong thing." Here is what breaks without it:

1. **Cross-category overlap.** Three friends rarely list the same movie. One loves horror films, one loves Taylor Swift, one loves natural-wine bars. An LLM can only match keywords or guess. Qloo's graph links those tastes through shared audiences, so it can name a restaurant or a film that all three are predicted to like, and say whose taste pulled it up the list (`feature.explainability`).
2. **A score for each person.** The fairness step needs a number for "how much will Priya like this place?" for every candidate and every person. Qloo returns that number (`filter.results.entities` with that person's signals). An LLM has no such number, so it can't prove nobody gets left out.
3. **Taste fingerprints.** "What does this group have in common?" is answered with Qloo tag affinities (`filter.type=urn:tag`), not adjectives an LLM made up.

If you remove Qloo, you lose the candidates, the per-person scores, the overlap and the evidence. What's left is a chatbot.

## Alternatives considered

Scored 1–5 on each criterion; "Qloo-decisive" asks how much worse it gets without Qloo.

| Idea | Qloo-decisive | Instantly understandable | Real audience | Non-obvious | Total | Why not |
|---|---|---|---|---|---|---|
| **Common Ground** (group taste negotiation) | 5 | 5 | 5 | 4 | **19** | Picked. The risk is that other entrants build a "group movie picker"; the fairness maths, cross-category plans and receipts set it apart. |
| Tour and venue routing for artists and comedians (heatmaps and audience overlap) | 5 | 3 | 4 | 3 | 15 | Qloo's own kit lists "Where should a pop-up or tour go?" as an example, so many entrants will build it. Hard to judge quality in a 2-minute demo. |
| Wedding or gala seating by taste chemistry | 4 | 4 | 3 | 5 | 16 | Creative, but hosts care more about family politics than taste. It also needs 20+ guests' input before the demo shows anything. |
| Gift concierge | 2 | 5 | 4 | 1 | 12 | An LLM alone is already decent at gifts, and it's a very common hackathon idea. |
| Taste-based friend or date matching | 4 | 4 | 3 | 2 | 13 | Crowded, raises privacy questions, and the result can't be judged in one session. |
| Brand and sponsor matching for podcasts | 5 | 2 | 4 | 2 | 13 | Qloo already sells this to agencies, and it doesn't make a fun demo. |
| Travel itinerary from your taste | 4 | 4 | 4 | 1 | 13 | The most common hackathon idea of all. Common Ground covers trips as one plan type anyway. |

Qloo's own three example ideas (lighting styles, meals for seniors, rare-disease journeys) were excluded on purpose.

The judging panel also fits: Live Nation, a sports and hospitality investor, a touring comedian, and an investor who backs consumer apps. All of them know nights out and the group chat that comes before one.

## How it works (the part that has to be right)

1. **Resolve tastes.** Each favourite becomes a Qloo entity through `/search` (typeahead in the UI, or the agent resolving free text). People's names are never sent to Qloo, only entity IDs.
2. **Taste fingerprints.** For each person, `filter.type=urn:tag` returns their top tags. Then each person's affinity is measured on the union of those tags (`filter.results.tags`), which gives a person × tag matrix. Shared tags are the "common ground"; tags where people disagree are the tension points. Two-person groups also use `/v2/analysis/compare`.
3. **Candidates.** One request with everyone's entities combined as signals, the user's filters (place, price, rating, exclusions found via `/v2/tags`), and `feature.explainability=true`. Plus one request per person for their own top picks, so nobody's favourites are missing from the shortlist.
4. **Score each person on one shared shortlist.** One request per person, with that person's signals and `filter.results.entities` set to the shortlist. Scores from different requests aren't comparable, so each person's scores become percentile ranks within the shortlist.
5. **Pick fairly.** Drop anything below a misery floor for anyone (average without misery). Rank the rest by the weighted geometric mean of percentiles (multiplicative aggregation: one unhappy person drags the score down). Weights come from a fairness ledger: whoever compromised on earlier plans gets a slightly bigger say next time.
6. **Explain.** For the chosen pick, the agent reports each person's percentile, whose favourites pulled it up (explainability), the shared tags it matches, and what each person gave up compared with their personal number one. The narrative must cite only these facts; the UI labels Qloo data separately from the agent's wording.
7. **Negotiate.** "Jun is vegetarian", "cheaper", "no horror", or a veto on one item makes the agent re-plan. It explains what changed and who it affected.

The LLM is the orchestrator. It reads the request, turns notes into Qloo filters (tag search), decides which plan items to fill, picks from the engine's ranked list, and writes the explanation. The server checks every pick against the scored shortlist, so the agent can't invent a restaurant.

## Risks and how they're handled

- **Qloo key arrives late** (keys are issued by hand within a few business days). The app runs against a synthetic mock of the same API surface, so everything else can be built and tested now. Switching to live is `QLOO_MODE=live` plus the key.
- **Data gaps in the hackathon environment** (the guide warns some regions are thin). Place plans default to New York; every step degrades gracefully and the UI says when Qloo returned nothing.
- **LLM key runs out during judging (Nov 2–16).** A deterministic planner runs the same engine without an LLM, so the demo never dies; only the chat narrative gets simpler.
- **Cost and abuse.** Small, summarised tool results, a cap on agent steps, server-side caching of Qloo responses (allowed by the dev guide), and a per-instance rate limit.
- **Data rules.** Mock data is synthetic and safe to publish. Live Qloo responses are cached in memory only and never written to the repo, as the developer guide requires.

## Scope

v1 (this build): groups of 2–6, plan items Dinner, Drinks, Movie, Series, Music, Book and Trip, agent chat with re-planning and vetoes, receipts drawer, fairness ledger, copy-to-group-chat, sample groups, an offline planner, a Qloo mock, tests, deploy config for Vercel.

Stretch: a neighbourhood heatmap for "where should we meet?" (`filter.type=urn:heatmap`), shareable group links, an MCP server so any MCP client can call the planner, and an evaluation script comparing fair picks with popularity and LLM-only baselines on live data.
