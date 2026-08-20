-- MODULE 8 CONTENT (junior f93aba12-3f1f-4d35-82be-fa4ae5af2d0a / associate 5b349627-31ad-429f-a569-b68ba1405875)

-- 1) Park PA/KC rows
UPDATE public.launchpad_slides SET slide_number = 106
 WHERE module_id = 'f93aba12-3f1f-4d35-82be-fa4ae5af2d0a' AND slide_type = 'practice_assignment';
UPDATE public.launchpad_slides SET slide_number = 107
 WHERE module_id = 'f93aba12-3f1f-4d35-82be-fa4ae5af2d0a' AND slide_type = 'knowledge_check';
UPDATE public.launchpad_slides SET slide_number = 106
 WHERE module_id = '5b349627-31ad-429f-a569-b68ba1405875' AND slide_type = 'practice_assignment';
UPDATE public.launchpad_slides SET slide_number = 107
 WHERE module_id = '5b349627-31ad-429f-a569-b68ba1405875' AND slide_type = 'knowledge_check';

-- 2) JUNIOR: update existing content slides 1-3
UPDATE public.launchpad_slides SET title = 'Learning Objectives', body = $b$By the end of this module, you can:

- Apply core negotiation principles (interests vs. positions, preparation, anchoring) to a real estate offer.
- Negotiate a single offer's price, conditions, closing date, and inclusions competently.
- Explain how Ontario's Open Offer Process works in a multiple-offer situation, and what stays confidential regardless.
- Handle a post-inspection repair negotiation using the real options available.
- Understand whose interests you're actually representing at the table.
- Use our full scriptbook of scripts and real internal case studies to build negotiating instinct, not just theory.$b$
 WHERE module_id = 'f93aba12-3f1f-4d35-82be-fa4ae5af2d0a' AND slide_number = 1;

UPDATE public.launchpad_slides SET title = 'Core Negotiation Principles', body = $b$Interests vs. positions — a stated position ("I want $650,000") is rarely the whole story. The underlying interest (needing to net enough to buy their next home, wanting a fast close, needing certainty) is what you're actually negotiating around. Ask questions to find the real interest before trading concessions.

Preparation beats improvisation — walk into every negotiation knowing the CMA Boss data cold: comparable sales, market conditions, and where this offer sits relative to fair value.

Anchoring only works if your anchor is credible.

Silence is a tool — let an offer or counter sit for a moment before responding; you don't owe an instant reaction.

Stay calm, stay professional — negotiations that get emotional usually get worse outcomes for everyone, including your own client.$b$
 WHERE module_id = 'f93aba12-3f1f-4d35-82be-fa4ae5af2d0a' AND slide_number = 2;

UPDATE public.launchpad_slides SET title = 'Negotiating a Single Offer', body = $b$The core levers beyond price:

- Closing date — sometimes worth more to one side than price itself.
- Conditions — a firmer offer with fewer/shorter conditions is often worth a price concession.
- Inclusions/exclusions — chattels can bridge a small price gap without either side moving on the number itself.
- Deposit size — a larger deposit can signal seriousness in a competitive situation.

Trade concessions deliberately — if you give something, get something back. Don't concede just to keep the deal moving, and confirm with your client before making any counter, verbally or otherwise.$b$
 WHERE module_id = 'f93aba12-3f1f-4d35-82be-fa4ae5af2d0a' AND slide_number = 3;

-- 3) JUNIOR: insert content slides 4-13
INSERT INTO public.launchpad_slides (module_id, slide_number, slide_type, title, body) VALUES
('f93aba12-3f1f-4d35-82be-fa4ae5af2d0a', 4, 'content', 'Multiple-Offer Situations', $b$Ontario's Open Offer Process — since TRESA, sellers have two paths in a multiple-offer situation.

- Blind bidding (the default): buyers are told there are competing offers and how many, but not the contents.
- Open Offer Process (seller's choice): the seller can direct their agent to disclose some or all competing offer details — price, closing date, deposit amount, conditions — to other bidders. If they choose to disclose, the same information must be given to every bidder who has submitted a valid offer, not selectively.

Personally identifiable buyer information stays confidential regardless. The seller can change their approach mid-process, but consistency across concurrent bidders at any given point is the rule — confirm exact mechanics with your mentor for edge cases.

Regardless of which path, buyers are always entitled to know the number of competing written offers.

"Bully"/pre-emptive offers: submitted before the scheduled offer date with an expiry forcing a fast decision. Sellers aren't obligated to consider them early, and buyers should understand they're giving up negotiating leverage by forcing urgency.$b$),
('f93aba12-3f1f-4d35-82be-fa4ae5af2d0a', 5, 'content', 'Repair Negotiations & Whose Interests You Represent', $b$After an inspection issue, the real options are:

- Buyer requests repairs (seller agrees, negotiates, or declines).
- Price reduction or closing-cost credit instead.
- Negotiated compromise — selective repairs or partial credits.
- Seller declines outright; buyer decides to proceed or walk.
- Contract cancellation — buyer may back out without penalty depending on condition wording.
- "As-is" sale where applicable.

Know these options cold before the conversation starts.

This isn't a neutral "let's find the middle" exercise — under TRESA and our Code of Ethics, you have a fiduciary duty to negotiate in your own client's best interest, not to broker a fair-feeling compromise. That said, honesty and fair dealing toward the other side is also a real obligation — advocacy doesn't permit dishonesty.$b$),
('f93aba12-3f1f-4d35-82be-fa4ae5af2d0a', 6, 'content', 'Scripts: Pricing & Listing, Multiple-Offer & Competitive', $b$Built on two techniques: low-pressure framing/structured choice, and "handle -> close -> pivot."

Seller wants to list above CMA Boss's recommendation:
"I don't know if this changes anything for you, but can I show you what the last three comparable sales in this price range actually did once they hit market? A lot of sellers assume starting higher gives them room to negotiate down. What the data's actually showing for homes like yours is the opposite — pricing right at this range is what's brought in multiple offers for similar listings recently. Knowing that, would it help to walk through what a launch at that price could realistically look like in the next two weeks?"

Anxious buyer in a multiple-offer Open Offer Process situation:
"Picture this for a second — offer night, and instead of guessing what everyone else is doing, you actually know the range the other offers are coming in at, because the seller chose to open this one up. That's the position you're in right now. So instead of stress-guessing a number, let's build an offer around what actually matters to this seller — would it help more to be strongest on price, or on certainty and closing flexibility?"

Buyer wants to submit a bully/pre-emptive offer:
"Totally understand wanting to get ahead of offer night. Here's what's worth knowing before we do: the seller isn't obligated to consider it early, and going in now means giving up the chance to see what else comes in on the scheduled date. Knowing that trade-off, would you rather move now with your strongest number, or hold and see the full picture first?"$b$),
('f93aba12-3f1f-4d35-82be-fa4ae5af2d0a', 7, 'content', 'Scripts: Financing & Conditions, Repairs & Post-Inspection', $b$Buyer hesitating to remove a financing condition close to deadline:
"Totally fair to want to be sure before this becomes official. Can I ask — is it the rate you're waiting on, or the lender's paperwork? Here's what happens next either way: if we wait past the deadline without an extension, the deal can fall apart entirely, deposit and all. Would it make more sense to get your lender on a quick call today, or would you rather I request a short extension from the seller's side first?"

A deadline is at risk and you need an extension from the other side:
"I want to be upfront rather than let this slip past the deadline quietly. My client needs a short extension to finalize financing — nothing about their intent to move forward has changed. Would your client be open to a 48-hour extension, or would a specific new date work better on your end?"

Seller upset about a buyer's repair request:
"I get why that stings, especially this close to the finish line. Before we react — there are really only a few ways this goes from here: agree to the repair, offer a credit instead, do a bit of both, or hold firm and see if they still want to move forward. Which of those feels most like you, knowing what we know about this buyer's motivation?"$b$),
('f93aba12-3f1f-4d35-82be-fa4ae5af2d0a', 8, 'content', 'Scripts: Closing & Timeline', $b$Closing date conflict between both sides:
"Sounds like the date itself matters more here than the price does — which actually gives us room. Would your client be open to trading a bit on closing flexibility if it meant a stronger number, or is the date genuinely fixed on their end?"

A client wants you to "just handle it" without checking in first:
"I appreciate the trust — and I'll always move fast for you. The one thing I won't do is commit you to something you haven't actually agreed to, even under time pressure. So here's how I'll work it: I'll bring you the decision the moment it needs making, fast, so we never lose time — but it's always your call, not mine."$b$),
('f93aba12-3f1f-4d35-82be-fa4ae5af2d0a', 9, 'content', 'Deal Saver Case Study: The Condo Special Assessment (Winner: Lexi)', $b$Situation: after offer acceptance, the buyer learns the condo corporation is discussing a possible special assessment for garage repairs — nothing approved or confirmed. The buyer wants the price to reflect the uncertainty; the seller won't negotiate over a hypothetical.

Winning approach: Lexi called the condo corporation and property management directly to find out how long the repairs had actually been discussed, before negotiating anything. She identified special assessment insurance — a real policy add-on — as a way to protect the buyer without asking the seller to absorb a cost that may never materialize. She also noted the lawyer's status certificate review would independently surface this information, and kept a condition extension available if more diligence was needed.

Script: "Before we respond to them, I want to make a few calls so we're negotiating with real information rather than assumptions. Let me get on the phone with the condo corporation and find out how long they've actually been discussing this — that changes everything."

Lesson: gather intelligence before you negotiate. Special assessment insurance exists and is an underused tool — it resolves this exact fear without creating an adversarial price fight.$b$),
('f93aba12-3f1f-4d35-82be-fa4ae5af2d0a', 10, 'content', 'Deal Saver Case Study: The Assisted Living Deadline (Winner: Lexi)', $b$Situation: an 82-year-old widow has 3 weeks until her assisted living suite is ready — non-refundable fee paid, movers booked. Buyers need a 7-day extension on financing and inspection conditions. Seller refuses any extension; buyers insist they're acting in good faith.

Winning approach: Lexi didn't negotiate the 7 days directly. She first sat with the seller's family to find the actual hard deadline — not "we can't extend," but the real number of days before the suite is lost. She then countered the buyer's agent with a shorter 3-4 day extension, proactively sourced faster contractors to compress the timeline, and offered a $5,000 concession as an alternative to more time — converting a time problem into a money problem, which is almost always easier to solve.

Scripts:
"The first thing I want to do is find out exactly when you need to give the assisted living facility your final answer. Once I know that, I know what we actually have to work with."
"What if instead of the extension, we asked them to take a small concession off the price? That gives you certainty today and gives them the reassurance they're looking for."

Lesson: a stated deadline and a real deadline are often different numbers — find the real one before you negotiate around it. When one side needs time and the other can't give it, money is frequently the bridge.$b$),
('f93aba12-3f1f-4d35-82be-fa4ae5af2d0a', 11, 'content', 'Deal Saver Case Study: The Divorce (Winner: Kristen)', $b$Situation: divorcing sellers agree they want to sell, but disagree on every point — every counteroffer takes days. The husband refuses a repair request; the wife wants to accept and move on. Neither wants to feel like they lost to their ex.

Winning approach: Kristen's core principle: data trumps drama. Instead of trying to get the sellers to agree with each other, she anchored both of them independently to hard market data — so neither felt like they were losing to their ex, they were just agreeing with the facts. She set explicit response-time standards to kill the multi-day delays, sent a goodwill gesture to the buyer's agent to keep the buyer at the table, and confirmed both sellers had independent legal counsel — since uncoordinated legal advice in a divorce can blow up a deal as fast as the sellers arguing.

Scripts:
"I understand you're both feeling strongly about this. Let me show you what the data actually says — because that's what's going to determine the right answer here, not either of your opinions."
"Does each of you have your own legal representation in the divorce? Because I want to make sure your respective lawyers are in the loop on this transaction before we go any further."

Lesson: the goal isn't to get two people to agree with each other — it's to get two people to independently agree with the data. In any divorce sale, confirm independent legal counsel early; it's protective, not optional.$b$),
('f93aba12-3f1f-4d35-82be-fa4ae5af2d0a', 12, 'content', 'Deal Saver Case Study: The Undisclosed Basement Flood (Winner: Hana)', $b$Situation: inspection came back clean, but a neighbour tells the buyers the basement flooded three years ago — professionally repaired, no water since, but never disclosed. One buyer wants to walk; the other needs real reassurance. The inspection condition expires in 48 hours.

Winning approach: Hana requested a condition extension immediately, then collected every piece of documentation (invoice, scope of work, warranty transferability). She correctly applied the RECO framework: a past repair, professionally handled and no longer defective, is not a hidden defect. She added a contractual disclosure clause requiring the sellers to declare all past repairs and known defects — creating legal accountability if anything surfaces later — and proposed a holdback tied to a post-closing drywall inspection: the buyers verify behind the walls themselves after taking possession, the holdback covers any repairs found, and it returns to the seller if there's nothing there.

Scripts:
"I want to add a clause that requires the sellers to confirm in writing that they've disclosed all past repairs and any defects that were relayed to them by previous owners. If anything comes up later, your lawyer has something to point to."
"We can structure a holdback — funds held in trust until you've had a chance to look behind those walls after closing. If there's nothing there, the money goes back to them. If there's an issue, you're covered."

Lesson: the real fear behind "I'm not sure about this house" is almost always "I don't know what I don't know." A holdback tied to a specific post-closing action removes that fear without requiring the seller to do anything before closing — and a disclosure clause in Schedule A creates legal accountability going forward.$b$),
('f93aba12-3f1f-4d35-82be-fa4ae5af2d0a', 13, 'content', 'Core Principles & Common Mistakes', $b$Seven techniques pulled directly from winning submissions across all four Deal Saver scenarios:

- Intelligence Before Negotiation — gather facts before you counter anything.
- Convert Time Problems Into Money Problems — when one side needs time and the other can't give it, a financial concession is often the faster bridge.
- Data Trumps Drama — in emotional transactions, replace opinion with market facts, inspection findings, or documentation.
- Use Contracts to Create Certainty — a well-drafted clause or holdback is a stronger tool than reassurance or a price cut when a client is scared of the unknown.
- Validate Before You Redirect — acknowledge the feeling before you offer the solution.
- Remind Clients What They're Walking Away From — when someone wants to walk, ask questions rather than argue.
- Pull in the Right People Early — lawyers, specialists, lenders, property managers, proactively and not as a last resort.

Common new-agent mistakes:
- Revealing more of your own client's motivation or urgency than necessary.
- Countering or conceding without confirming instructions from your client first.
- Letting emotion show at the table.
- Not documenting verbal negotiation points.
- Treating a bully offer's forced timeline as more urgent than it actually is.$b$);

-- 4) JUNIOR: move parked rows into place and fill bodies
UPDATE public.launchpad_slides SET slide_number = 14, title = 'Practice Assignment', body = $b$1) Role-play a single-offer negotiation with your mentor, trading at least two non-price concessions (closing date, inclusions, conditions).
2) Role-play a multiple-offer scenario under the Open Offer Process — practice explaining it to a client in plain language.
3) Role-play a post-inspection repair negotiation from both the buyer and seller side.
4) Pick one Deal Saver case study and discuss with your mentor what you would have tried differently, and why the winning approach worked better.$b$
 WHERE module_id = 'f93aba12-3f1f-4d35-82be-fa4ae5af2d0a' AND slide_number = 106;

UPDATE public.launchpad_slides SET slide_number = 15, title = 'Knowledge Check', body = $b$1) What's the difference between a position and an interest in a negotiation, and why does it matter?
2) A seller wants to disclose competing offer details to some bidders but not others — is that allowed? (No)
3) Regardless of blind or open bidding, what are buyers always entitled to know? (The number of competing written offers)
4) Name three ways a post-inspection repair issue can be resolved short of the deal falling apart.
5) Why is it inaccurate to describe real estate negotiation as "finding a fair middle ground" for both sides?
6) In the "handle -> close -> pivot" objection structure, what happens if the client isn't ready to close after you've handled their objection? (You pivot)
7) In the Condo Special Assessment scenario, what tool did Lexi identify that protected the buyer without asking the seller for anything? (Special assessment insurance)
8) What was the one move in the Divorce scenario that no other agent thought of? (Confirming both sellers had independent legal counsel)$b$
 WHERE module_id = 'f93aba12-3f1f-4d35-82be-fa4ae5af2d0a' AND slide_number = 107;

-- 5) ASSOCIATE: update existing content slides 1-3
UPDATE public.launchpad_slides SET title = 'How to Use This Book', body = $b$Negotiation Fundamentals (the full Junior module) is not required here — you already have the underlying skill. This is a working reference: ready-to-adapt scripts for the negotiation situations that come up most in our specific market and process, plus real case studies from Luxe's own coaching program.

Every script is built on two techniques: low-pressure framing/structured choice, and a "handle -> close -> pivot" objection structure. Adapt the language to your own voice — the technique is what matters, not the exact wording.

Quick compliance reminders:
- You represent your client's interests specifically, not a neutral middle ground.
- Confirm instructions before countering or conceding.
- If a seller is using the Open Offer Process, any disclosed offer detail must go to every bidder who submitted a valid offer, not selectively.$b$
 WHERE module_id = '5b349627-31ad-429f-a569-b68ba1405875' AND slide_number = 1;

UPDATE public.launchpad_slides SET title = 'Pricing & Listing Scripts', body = $b$Seller wants to list above CMA Boss's recommended range:
"I don't know if this changes anything for you, but can I walk you through what the last three comparables in this range actually did once they hit market? A lot of sellers assume starting higher gives more room to negotiate down — what the data's showing for homes like yours is the opposite. Knowing that, would it help to talk through what a launch at this range could look like in the next two weeks?"

Seller is frustrated after several showings with no offers:
"I hear you — that's a frustrating spot to be in. Before we react, let's look at what the showings are actually telling us. Buyers are walking through, which means the marketing's working. No offers usually points to one thing: price relative to what they're comparing it against. Would it help to look at what's sold in the last two weeks specifically, so we're deciding based on this week's data, not when we first listed?"$b$
 WHERE module_id = '5b349627-31ad-429f-a569-b68ba1405875' AND slide_number = 2;

UPDATE public.launchpad_slides SET title = 'Multiple-Offer & Competitive Situation Scripts', body = $b$Anxious buyer heading into a multiple-offer Open Offer Process:
"Picture this — offer night, and instead of guessing what everyone else is doing, you actually know the range the other offers are in, because this seller chose to open the process up. That's the position you're in. So instead of stress-guessing a number, let's build your offer around what actually matters to this seller — would it help more to lead on price, or on certainty and closing flexibility?"

Buyer wants to submit a bully/pre-emptive offer:
"Totally understand wanting to get ahead of offer night. Here's what's worth knowing: the seller isn't obligated to consider it early, and going in now means giving up the chance to see what else comes in on the scheduled date. Knowing that trade-off, would you rather move now with your strongest number, or hold and see the full picture first?"

Buyer deciding whether to waive conditions to compete:
"I want you fully informed before you decide this one. Waiving financing or inspection can make an offer more competitive, but it also means giving up your safety net if something's wrong. Given what we know about this property and your financing — is this a case where you're comfortable with that trade, or one where we hold the line?"$b$
 WHERE module_id = '5b349627-31ad-429f-a569-b68ba1405875' AND slide_number = 3;

-- 6) ASSOCIATE: insert content slides 4-11
INSERT INTO public.launchpad_slides (module_id, slide_number, slide_type, title, body) VALUES
('5b349627-31ad-429f-a569-b68ba1405875', 4, 'content', 'Financing & Conditions Scripts', $b$Buyer hesitating to remove a financing condition close to deadline:
"Fair to want to be sure before this becomes official. Can I ask — is it the rate you're waiting on, or the lender's paperwork? Here's what happens either way: if we pass the deadline with no extension, the deal can fall apart entirely, deposit included. Would it make more sense to get your lender on a quick call today, or should I request a short extension from the seller's side first?"

A deadline is at risk and you need an extension from the other side:
"I want to be upfront rather than let this slip past the deadline quietly. My client needs a short extension to finalize financing — nothing about their intent to move forward has changed. Would your client be open to a 48-hour extension, or would a specific new date work better on your end?"$b$),
('5b349627-31ad-429f-a569-b68ba1405875', 5, 'content', 'Repairs & Post-Inspection Scripts', $b$Seller upset about a buyer's repair request:
"I get why that stings this close to the finish line. Before we react — there are really only a few ways this goes from here: agree to the repair, offer a credit instead, do a bit of both, or hold firm and see if they still move forward. Which of those feels most like you, knowing what we know about this buyer's motivation?"

Buyer's inspection turned up an issue and they're considering walking:
"Before you decide anything, let's separate the issue itself from the emotion of finding it — that's normal. Realistically, you've got options here: ask for repairs, ask for a credit, or walk away if this one doesn't sit right with you. Which of those is actually about the house, and which is about the surprise of finding something at all?"$b$),
('5b349627-31ad-429f-a569-b68ba1405875', 6, 'content', 'Closing & Timeline Scripts', $b$Closing date conflict between both sides:
"Sounds like the date itself matters more here than the price does — which actually gives us room. Would your client be open to trading a bit on closing flexibility if it meant a stronger number, or is the date genuinely fixed on their end?"

A client wants you to "just handle it" without checking in first:
"I appreciate the trust — and I'll always move fast for you. The one thing I won't do is commit you to something you haven't actually agreed to, even under time pressure. So here's how I'll work it: I'll bring you the decision the moment it needs making, fast, so we never lose time — but it's always your call, not mine."$b$),
('5b349627-31ad-429f-a569-b68ba1405875', 7, 'content', 'Deal Saver Case Study: The Condo Special Assessment (Winner: Lexi)', $b$Situation: after offer acceptance, the buyer learns the condo corporation is discussing a possible special assessment for garage repairs — nothing approved or confirmed. The buyer wants the price to reflect the uncertainty; the seller won't negotiate over a hypothetical.

Winning approach: Lexi called the condo corporation and property management directly to find out how long the repairs had actually been discussed, before negotiating anything. She identified special assessment insurance — a real policy add-on — as a way to protect the buyer without asking the seller to absorb a cost that may never materialize. She also noted the lawyer's status certificate review would independently surface this information, and kept a condition extension available if more diligence was needed.

Script: "Before we respond to them, I want to make a few calls so we're negotiating with real information rather than assumptions. Let me get on the phone with the condo corporation and find out how long they've actually been discussing this — that changes everything."

Lesson: gather intelligence before you negotiate. Special assessment insurance exists and is an underused tool — it resolves this exact fear without creating an adversarial price fight.$b$),
('5b349627-31ad-429f-a569-b68ba1405875', 8, 'content', 'Deal Saver Case Study: The Assisted Living Deadline (Winner: Lexi)', $b$Situation: an 82-year-old widow has 3 weeks until her assisted living suite is ready — non-refundable fee paid, movers booked. Buyers need a 7-day extension on financing and inspection conditions. Seller refuses any extension; buyers insist they're acting in good faith.

Winning approach: Lexi didn't negotiate the 7 days directly. She first sat with the seller's family to find the actual hard deadline — not "we can't extend," but the real number of days before the suite is lost. She then countered the buyer's agent with a shorter 3-4 day extension, proactively sourced faster contractors to compress the timeline, and offered a $5,000 concession as an alternative to more time — converting a time problem into a money problem, which is almost always easier to solve.

Scripts:
"The first thing I want to do is find out exactly when you need to give the assisted living facility your final answer. Once I know that, I know what we actually have to work with."
"What if instead of the extension, we asked them to take a small concession off the price? That gives you certainty today and gives them the reassurance they're looking for."

Lesson: a stated deadline and a real deadline are often different numbers — find the real one before you negotiate around it. When one side needs time and the other can't give it, money is frequently the bridge.$b$),
('5b349627-31ad-429f-a569-b68ba1405875', 9, 'content', 'Deal Saver Case Study: The Divorce (Winner: Kristen)', $b$Situation: divorcing sellers agree they want to sell, but disagree on every point — every counteroffer takes days. The husband refuses a repair request; the wife wants to accept and move on. Neither wants to feel like they lost to their ex.

Winning approach: Kristen's core principle: data trumps drama. Instead of trying to get the sellers to agree with each other, she anchored both of them independently to hard market data — so neither felt like they were losing to their ex, they were just agreeing with the facts. She set explicit response-time standards to kill the multi-day delays, sent a goodwill gesture to the buyer's agent to keep the buyer at the table, and confirmed both sellers had independent legal counsel — since uncoordinated legal advice in a divorce can blow up a deal as fast as the sellers arguing.

Scripts:
"I understand you're both feeling strongly about this. Let me show you what the data actually says — because that's what's going to determine the right answer here, not either of your opinions."
"Does each of you have your own legal representation in the divorce? Because I want to make sure your respective lawyers are in the loop on this transaction before we go any further."

Lesson: the goal isn't to get two people to agree with each other — it's to get two people to independently agree with the data. In any divorce sale, confirm independent legal counsel early; it's protective, not optional.$b$),
('5b349627-31ad-429f-a569-b68ba1405875', 10, 'content', 'Deal Saver Case Study: The Undisclosed Basement Flood (Winner: Hana)', $b$Situation: inspection came back clean, but a neighbour tells the buyers the basement flooded three years ago — professionally repaired, no water since, but never disclosed. One buyer wants to walk; the other needs real reassurance. The inspection condition expires in 48 hours.

Winning approach: Hana requested a condition extension immediately, then collected every piece of documentation (invoice, scope of work, warranty transferability). She correctly applied the RECO framework: a past repair, professionally handled and no longer defective, is not a hidden defect. She added a contractual disclosure clause requiring the sellers to declare all past repairs and known defects — creating legal accountability if anything surfaces later — and proposed a holdback tied to a post-closing drywall inspection: the buyers verify behind the walls themselves after taking possession, the holdback covers any repairs found, and it returns to the seller if there's nothing there.

Scripts:
"I want to add a clause that requires the sellers to confirm in writing that they've disclosed all past repairs and any defects that were relayed to them by previous owners. If anything comes up later, your lawyer has something to point to."
"We can structure a holdback — funds held in trust until you've had a chance to look behind those walls after closing. If there's nothing there, the money goes back to them. If there's an issue, you're covered."

Lesson: the real fear behind "I'm not sure about this house" is almost always "I don't know what I don't know." A holdback tied to a specific post-closing action removes that fear without requiring the seller to do anything before closing — and a disclosure clause in Schedule A creates legal accountability going forward.$b$),
('5b349627-31ad-429f-a569-b68ba1405875', 11, 'content', 'Core Principles (Deal Saver Appendix)', $b$Seven techniques pulled directly from winning submissions across all four scenarios:

- Intelligence Before Negotiation — gather facts before you counter anything. "Before we respond to them, I want to make a few calls so we're negotiating with real information rather than assumptions."
- Convert Time Problems Into Money Problems — when one side needs time and the other can't give it, a financial concession is often the faster bridge.
- Data Trumps Drama — in emotional transactions, replace opinion with market facts, inspection findings, or documentation. "Let me show you what the data actually says."
- Use Contracts to Create Certainty — a well-drafted clause or holdback is a stronger tool than reassurance or a price cut when a client is scared of the unknown.
- Validate Before You Redirect — acknowledge the feeling before you offer the solution. Skipping this step almost always creates resistance.
- Remind Clients What They're Walking Away From — when someone wants to walk, ask questions rather than argue; reconnect them with why they wanted the deal in the first place.
- Pull in the Right People Early — lawyers, specialists, lenders, property managers. Loop them in proactively, not as a last resort.$b$);

-- 7) ASSOCIATE: move parked rows into place and fill bodies
UPDATE public.launchpad_slides SET slide_number = 12, title = 'Practice Assignment', body = $b$1) Review the five script categories once with your mentor and identify which technique (low-pressure framing or handle-close-pivot) each script relies on.
2) Pick one Deal Saver case study and discuss with your mentor what you would have tried differently, and why the winning approach worked better.
3) Adapt one script from this book into your own voice and practice delivering it out loud once.$b$
 WHERE module_id = '5b349627-31ad-429f-a569-b68ba1405875' AND slide_number = 106;

UPDATE public.launchpad_slides SET slide_number = 13, title = 'Knowledge Check', body = $b$1) A seller pushes back on CMA Boss's recommended price — what's the technique behind the suggested response, not just the words?
2) In the multiple-offer script for an anxious buyer, what does the visualization technique accomplish?
3) Why does the "just handle it" script matter even though it might slow down a fast-moving decision?
4) In the Condo Special Assessment scenario, what tool did Lexi identify that protected the buyer without asking the seller for anything? (Special assessment insurance)
5) In the Assisted Living Deadline scenario, what was Lexi's first move before countering the buyer's extension request? (Finding the seller's actual hard deadline)
6) What was the one move in the Divorce scenario that no other agent thought of? (Confirming both sellers had independent legal counsel)
7) In the Undisclosed Basement Flood scenario, what two contractual tools did Hana use together to resolve the impasse? (A disclosure clause and a holdback)
8) What's the difference between a "hidden defect" and what the sellers actually did in the flood scenario, under the RECO framework Hana cited?$b$
 WHERE module_id = '5b349627-31ad-429f-a569-b68ba1405875' AND slide_number = 107;