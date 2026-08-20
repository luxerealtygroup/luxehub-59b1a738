
UPDATE launchpad_slides SET slide_number = 106 WHERE id = 'f3dc9372-3c7e-4346-a5e8-9a369a383673';
UPDATE launchpad_slides SET slide_number = 107 WHERE id = 'f7501d3e-b849-4913-be30-7c7f9b43be34';
UPDATE launchpad_slides SET slide_number = 106 WHERE id = '29c8aa87-549a-4847-9d21-8dd1a4e49b6b';
UPDATE launchpad_slides SET slide_number = 107 WHERE id = 'aa911d6b-229f-4fdf-ad3b-fef7e3f42058';

-- ===== JUNIOR =====
UPDATE launchpad_slides SET title = 'Learning Objectives', body = $b$By the end of this module, the agent can:
- Explain exactly what a TC owns vs. what the agent owns across a live transaction
- Know what the agent must proactively hand off to the TC, and when, at each stage of the deal
- Recognize the most common friction points between agents and TCs, and how to avoid them
- Know what to do when a deadline is at risk of being missed$b$ WHERE id = '5e361d75-f298-4459-889a-9a4fe37ddb3b';

UPDATE launchpad_slides SET title = 'The TC''s Role & The Agent''s Role', body = $b$A TC's core ownership includes:
- Confirming the deposit was delivered and the trust receipt issued
- Tracking condition deadlines (financing, inspection, status certificate) and confirming waivers were submitted
- Coordinating closing logistics with lawyers on both sides
- Managing the detailed task checklist in Asana — a system the agent never logs into

The TC is not chasing the agent for information they could have gotten themselves from the file — the agent needs to actively feed them what they need, when they need it.

Common misconception for new agents: once a deal is firm, the transaction "runs itself" through the TC. In reality, the agent still owns:
- Scheduling and attending the home inspection
- Negotiating any repair requests or price adjustments that come out of it
- Staying the primary point of contact for the client's questions and anxiety — the TC handles logistics, but the client relationship is still the agent's job
- Coordinating the closing walkthrough and key handoff$b$ WHERE id = 'cf5ead5c-7364-476a-8faf-272c17ff444e';

UPDATE launchpad_slides SET title = 'Handoff Points Across the Deal Timeline', body = $b$- At Offer Accepted — agent gets the Agreement of Purchase and Sale executed via AuthentiSign; TC opens the file in Asana.
- At Deposit Delivered — agent confirms client has sent certified funds; TC confirms receipt and trust receipt issued.
- At Home Inspection — agent schedules, attends, and negotiates any resulting repair requests; TC tracks the inspection condition deadline.
- At Documents to Lender — agent confirms client is actively working with their lender; TC tracks the financing condition deadline.
- At Conditions Removed — agent gets the Waiver/Notice of Fulfillment signed and sent via AuthentiSign; TC confirms all conditions are cleared and the deal is firm.
- At Lawyers Prepare — agent stays available for client questions; TC coordinates title/closing details with both lawyers.
- At Closing Day — agent confirms the final walkthrough and hands over keys; TC confirms funds transferred and the file closed.

The pattern to notice: almost every TC action depends on something the agent did first. If the agent is slow, the TC's tracking is only as good as what they've been told.$b$ WHERE id = '7ba83717-31b0-43cd-a170-471d23c99db2';

INSERT INTO launchpad_slides (module_id, slide_number, slide_type, title, body) VALUES
('edfa2b7b-65e5-45ce-9967-3b939e6beaa5', 4, 'content', 'Communication Protocol (Our Real Workflow)', $b$Once you sign paperwork, you upload it to LUXEhub. Our Director of Operations, Marie Zinger, takes it from there:
- She uploads every document to SkySlope so the brokerage can begin reviewing the file.
- She also sends the relevant documents out to the mortgage broker, lawyer, and client directly.
- The client's email from Marie includes next steps and important dates, so they have everything handy in one place.

Marie will not already have the mortgage broker's or lawyer's contact information — you have to pass it along to her as soon as you get it. If you sit on it, the whole downstream chain stalls waiting on you specifically.

If Marie needs clarification or additional documents to complete anything, she'll come back and ask — respond quickly, since you're now the bottleneck if you don't.

What's consistent regardless of the specific step: don't let Marie find out about a change (repair negotiation, extended condition, client conflict) after the fact — flag it as soon as you know. If a deadline is at risk of being missed, escalate immediately rather than waiting to see if it resolves itself.$b$),
('edfa2b7b-65e5-45ce-9967-3b939e6beaa5', 5, 'content', 'Common Friction Points (and How to Avoid Them)', $b$- Agent forgets to notify the TC when a condition is waived — the TC is tracking a deadline that's already been cleared, creating confusion and wasted follow-up.
- Documents aren't signed in time — an Amendment or Waiver sitting unsigned in AuthentiSign blocks the TC from updating the file status.
- Agent is unreachable during a critical window (e.g., during the conditional period) — the TC can't move the file forward without agent input on client status.
- Over-promising timelines to a client without checking feasibility with the TC first — this creates pressure on the TC to work around a commitment they never agreed to.
- Sitting on mortgage broker or lawyer contact info instead of passing it to Marie immediately — she can't send documents to a lender or lawyer she doesn't have contact details for, and the whole chain stalls waiting on you.$b$),
('edfa2b7b-65e5-45ce-9967-3b939e6beaa5', 6, 'content', 'What Good Coordination Looks Like', $b$- Proactive status updates, not just responses when asked.
- Checking LUXEhub regularly rather than relying on someone else to chase you.
- Respecting that the TC's Asana process exists to protect the deal, not to create extra work — feeding it accurately makes everyone's job easier, including the agent's.$b$);

UPDATE launchpad_slides SET slide_number = 7, title = 'Practice Assignment', body = $b$1) Walk through a real (or sample) file with your mentor and Marie together, tracing every handoff point from Slide 3.
2) Practice the exact hand-off moment: sign a sample document, upload it to LUXEhub, and confirm what Marie does with it next (SkySlope filing, distribution to lender/lawyer/client).
3) Role-play a scenario where a condition deadline is at risk — practice escalating it correctly and early.
4) Confirm with your mentor what happens the first time you get a new lender or lawyer's contact info on a file — practice passing it to Marie immediately rather than waiting.$b$ WHERE id = 'f3dc9372-3c7e-4346-a5e8-9a369a383673';

UPDATE launchpad_slides SET slide_number = 8, title = 'Knowledge Check', body = $b$1) A financing condition is waived — whose job is it to make sure the TC knows, and how? (The agent's — sign the Waiver/Notice of Fulfillment via AuthentiSign and make sure the TC is aware)
2) True or false: once a deal is firm, the agent's role in the transaction is basically done. (False)
3) Name two common friction points between agents and TCs.
4) What should an agent do if they realize a deadline is at risk of being missed? (Escalate immediately)
5) Who uploads documents to SkySlope for brokerage review, and what does the agent need to do first? (Marie Zinger — but the agent must sign and upload to LUXEhub first)
6) An agent just got a new lender's contact info from their buyer — what should they do with it? (Pass it to Marie immediately)
7) What does the client's email from Marie include, beyond the documents themselves? (Next steps and important dates)$b$ WHERE id = 'f7501d3e-b849-4913-be30-7c7f9b43be34';

-- ===== ASSOCIATE =====
UPDATE launchpad_slides SET title = 'Learning Objectives', body = $b$By the end of this module, the agent can:
- Apply our specific agent/TC handoff points across the Ontario offer timeline
- Avoid the friction points that come up specifically because of our LUXEhub/Asana split$b$ WHERE id = '84e33444-d602-49f6-a8ad-12e0635d5cb3';

UPDATE launchpad_slides SET title = 'Quick-Reference: Handoff Points', body = $b$- Offer Accepted — agent: APS executed via AuthentiSign; TC: opens file in Asana.
- Deposit Delivered — agent: confirm client sent certified funds; TC: confirm receipt & trust receipt.
- Home Inspection — agent: schedule, attend, negotiate repairs; TC: track inspection deadline.
- Documents to Lender — agent: confirm client engaged with lender; TC: track financing deadline.
- Conditions Removed — agent: get Waiver/Notice of Fulfillment signed; TC: confirm deal is firm.
- Lawyers Prepare — agent: stay available for client questions; TC: coordinate with both lawyers.
- Closing Day — agent: final walkthrough, key handoff; TC: confirm funds transferred, close file.$b$ WHERE id = '0e85f1e7-aabc-4467-be53-d107a0498662';

UPDATE launchpad_slides SET title = 'What''s Actually New Here (Asana Access)', body = $b$You won't see the TC's process directly — it lives in Asana, which agents don't access. If you're used to viewing or editing a shared transaction checklist yourself, that's not how it works here: you feed information to the TC (via LUXEhub/AuthentiSign), they manage the Asana-side tracking.

Every TC action depends on the agent doing something first — signing a document, confirming a deadline was met. The TC isn't independently monitoring your client relationship; if you don't tell them something changed, they're working from stale information.$b$ WHERE id = 'd0439a49-19cf-4bef-a780-0831e53e77b4';

INSERT INTO launchpad_slides (module_id, slide_number, slide_type, title, body) VALUES
('d6d22271-d7ad-4391-946e-19f8ae573845', 4, 'content', 'What''s Actually New Here (Our Real Workflow)', $b$You sign, you upload to LUXEhub. Marie Zinger (Director of Operations) takes it from there — she files to SkySlope for brokerage review and sends relevant documents to the mortgage broker, lawyer, and client (whose email also gets next steps and important dates).

Marie won't already have lender/lawyer contact info — pass it to her the moment you get it, or the whole chain stalls on you.$b$);

UPDATE launchpad_slides SET slide_number = 5, title = 'Practice Assignment', body = $b$1) Practice the sign → upload to LUXEhub → Marie files to SkySlope sequence on a sample document.
2) Confirm with your mentor what to do the moment you get new lender/lawyer contact info on a file.$b$ WHERE id = '29c8aa87-549a-4847-9d21-8dd1a4e49b6b';

UPDATE launchpad_slides SET slide_number = 6, title = 'Knowledge Check', body = $b$1) Can agents view or edit the TC's task checklist directly? (No — it lives in Asana)
2) A condition gets waived — what must happen before the TC can update the file? (The Waiver/Notice of Fulfillment must be signed via AuthentiSign first)
3) Who uploads signed documents to SkySlope, and what has to happen before she can? (Marie Zinger — agent must sign and upload to LUXEhub first)
4) What information does Marie need from the agent that she won't already have? (Mortgage broker's and lawyer's contact information)$b$ WHERE id = 'aa911d6b-229f-4fdf-ad3b-fef7e3f42058';
