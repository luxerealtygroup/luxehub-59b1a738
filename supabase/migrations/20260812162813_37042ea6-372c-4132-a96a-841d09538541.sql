-- Module 3 content: Junior (73637980-8a53-42f1-8190-25bf5f14254b) and Associate (5dd033f8-0f66-4ed9-8caa-57ce57089372)

-- 1. Park PA/KC rows out of the way
UPDATE public.launchpad_slides SET slide_number = 106
 WHERE module_id IN ('73637980-8a53-42f1-8190-25bf5f14254b','5dd033f8-0f66-4ed9-8caa-57ce57089372') AND slide_type = 'practice_assignment';
UPDATE public.launchpad_slides SET slide_number = 107
 WHERE module_id IN ('73637980-8a53-42f1-8190-25bf5f14254b','5dd033f8-0f66-4ed9-8caa-57ce57089372') AND slide_type = 'knowledge_check';

-- 2. JUNIOR: update existing content rows 1-3
UPDATE public.launchpad_slides SET title = 'Learning Objectives', body = $md$By the end of this module, you can:

- Explain what happens and who is responsible when a new lead enters the system, from source to first contact.
- Apply our tag categories correctly and keep smart list membership accurate so AI re-engagement keeps working.
- Know the standard talk track for each priority queue and cadence list.
- Move a lead between lists correctly, and know when a move must be manual vs. automatic.
- Identify what a mentor checks when reviewing a new agent's database discipline.$md$
 WHERE module_id = '73637980-8a53-42f1-8190-25bf5f14254b' AND slide_number = 1;

UPDATE public.launchpad_slides SET title = 'From Lead Source to First Contact', body = $md$Every lead source — Zillow, referral, sign call, sphere, past client — routes automatically into FUB and lands in NEW — NOT CONTACTED.

- First contact attempt should happen same-day. Every hour that passes measurably lowers response rates. This is the single highest-leverage habit in this module.
- If contact is attempted but not made, the lead moves to NEW — ATTEMPTED CONTACT. This is a deliberate move, not something left to chance.
- Once a real two-way conversation happens, qualify the lead and move it into A — Hot Prospect if they are actively transacting soon, or into a nurture cadence list (B — Warm, C — Cool, Long Term Nurture) if they are further out.

Confirm with your mentor the exact automation your team uses to trigger these list moves.$md$
 WHERE module_id = '73637980-8a53-42f1-8190-25bf5f14254b' AND slide_number = 2;

UPDATE public.launchpad_slides SET title = 'The Lead Day Pond', body = $md$Separate from your own personal smart lists, there is a shared Lead Day Pond — a rotating shared responsibility, not a personal list.

- Each agent is assigned a specific day of the week as their lead day.
- On your lead day, you are responsible for monitoring the pond and calling every lead in it. If Monday is your lead day, every Monday you check the pond and work those leads, regardless of what else is on your plate.
- Leads in the shared pond only get worked if the assigned agent actually shows up for their day.
- Missing your lead day does not just cost you personally — it means those leads may go completely unworked until the next agent's day comes around.

Treat your lead day with the same non-negotiable priority as CALL NOW.$md$
 WHERE module_id = '73637980-8a53-42f1-8190-25bf5f14254b' AND slide_number = 3;

-- JUNIOR: insert content slides 4-8
INSERT INTO public.launchpad_slides (module_id, slide_number, title, slide_type, body) VALUES
('73637980-8a53-42f1-8190-25bf5f14254b', 4, 'Tags: What They''re For (and What They''re Not For)', 'content', $md$Smart lists track where a lead is in priority/cadence — that is status. Tags are different: they capture attributes about the lead that do not change based on where they are in the pipeline.

Our standard tag categories:
- Property address the lead came in on
- Newsletter subscriber status, and which region
- Sphere — whether the lead is part of your personal sphere
- Events invite list
- Pop-by list

Tags and smart lists work together but answer different questions: a smart list tells you what to do with this lead right now; a tag tells you what this lead is. A lead can be accurately tagged as sphere and newsletter-subscribed while sitting in C — Cool, and that is normal, not a conflict.$md$),
('73637980-8a53-42f1-8190-25bf5f14254b', 5, 'Working Each List: What "Working It" Means', 'content', $md$- CALL NOW / HANDRAISERS — AI ENGAGED: phone first, text second, same-day, ideally same-hour response.
- NEW — NOT CONTACTED / NEW — ATTEMPTED CONTACT: multiple contact attempts across channels before giving up on first contact. Log every attempt as a note, even if there is no answer.
- A — Hot Prospect: weekly personal touch, not just an automated drip. It should feel like a real check-in.
- B — Warm / C — Cool / Long Term Nurture / Sphere-Past Clients: mostly cadence-driven and can lean more on templated content, but a personal note now and then (birthday, listing anniversary, market update) keeps them warm.$md$),
('73637980-8a53-42f1-8190-25bf5f14254b', 6, 'Moving Leads Between Lists', 'content', $md$- Moves must reflect reality, not wishful thinking. Do not leave a cold lead sitting in A — Hot Prospect because you do not want to give up on it.
- Every move should be deliberate and logged with a note explaining why. Example: "Spoke with buyer, pre-approval in progress, moving to A — Hot Prospect."
- If a lead goes quiet past its expected cadence, that is exactly what should trigger the AI re-engagement tool.

List accuracy is not just good hygiene — it is what makes that tool work at all.$md$),
('73637980-8a53-42f1-8190-25bf5f14254b', 7, 'What Your Mentor Checks', 'content', $md$- Are notes logged for every real contact attempt, not just the ones that connected?
- Are leads sitting in the wrong list — stale "Hot" tags, forgotten "New" leads?
- Is same-day first contact actually happening, or slipping to next day?
- Are the AI re-engagement responses (HANDRAISERS — AI ENGAGED) being worked promptly?
- Is the Lead Day Pond actually being worked on your assigned day, every time?$md$),
('73637980-8a53-42f1-8190-25bf5f14254b', 8, 'Prospecting & Lead Generation: Scripts & Roleplay', 'content', $md$Everything above is about working leads that already exist. This is about generating new ones yourself — a real, expected skill.

We teach this through scripting and roleplay with your mentor, across:
- FSBO (For Sale By Owner) conversations
- Expired listing conversations
- Cold calling and door knocking
- Sphere of influence growth

Your mentor will work through actual scripts for each with you and run live roleplay. This is a practiced skill built through repetition with feedback, not memorization alone.$md$);

-- JUNIOR: PA -> 9, KC -> 10
UPDATE public.launchpad_slides SET slide_number = 9, title = 'Practice Assignment', body = $md$1. Pull up 5 real leads currently in NEW — NOT CONTACTED with your mentor and role-play the first-contact call/text for each.
2. Review your own database with your mentor and identify any lead sitting in the wrong list. Discuss why, and correctly re-tag it.
3. Shadow your mentor working their A — Hot Prospect list for a week, and compare their approach to a purely automated cadence touch.
4. Find one lead in HANDRAISERS — AI ENGAGED (yours or a teammate's, with permission) and discuss what a strong human follow-up looks like.
5. Roleplay at least one FSBO, expired listing, or cold-call script with your mentor, and get direct feedback before trying it live.
6. Confirm your assigned lead day with your mentor, and shadow the current lead-day agent working the pond on their day before your first solo turn.$md$
 WHERE module_id = '73637980-8a53-42f1-8190-25bf5f14254b' AND slide_number = 106;

UPDATE public.launchpad_slides SET slide_number = 10, title = 'Knowledge Check', body = $md$1. A new lead comes in from a sign call — what list does it land in, and what should happen within the same day? (NEW — NOT CONTACTED; same-day first contact)
2. Why does list accuracy matter beyond staying organized? (It feeds the AI re-engagement tool's accuracy)
3. What is the difference in approach between working A — Hot Prospect and working C — Cool?
4. A lead in HANDRAISERS — AI ENGAGED just responded — what should the agent do, and how fast? (Work it like CALL NOW, same day/hour)
5. True or false: if a lead does not respond, there is nothing to log. (False)
6. Name three of our tag categories and explain how tags differ from smart lists.
7. Name three prospecting activities taught through scripting and roleplay.
8. What happens if an agent misses their assigned Lead Day, and why does that matter beyond their own numbers?$md$
 WHERE module_id = '73637980-8a53-42f1-8190-25bf5f14254b' AND slide_number = 107;

-- 3. ASSOCIATE: update existing content rows 1-3
UPDATE public.launchpad_slides SET title = 'Learning Objectives', body = $md$By the end of this module, you can:

- Apply our tag categories correctly and keep smart list membership accurate.
- Work our smart lists using our exact naming and cadence.
- Understand why list-membership accuracy matters more here, since it directly drives our AI re-engagement tool.$md$
 WHERE module_id = '5dd033f8-0f66-4ed9-8caa-57ce57089372' AND slide_number = 1;

UPDATE public.launchpad_slides SET title = 'Quick-Reference: Our Tag Categories', body = $md$Tags capture what a lead IS, not what to do with them right now — that is what smart lists are for.

Our categories:
- Property address the lead came in on
- Newsletter subscriber status and region
- Sphere status
- Events invite list
- Pop-by list$md$
 WHERE module_id = '5dd033f8-0f66-4ed9-8caa-57ce57089372' AND slide_number = 2;

UPDATE public.launchpad_slides SET title = 'Quick-Reference: Our Smart Lists', body = $md$Priority:
- CALL NOW
- HANDRAISERS — AI ENGAGED
- NEW — NOT CONTACTED
- NEW — ATTEMPTED CONTACT
- A — Hot Prospect (weekly)

Cadence:
- B — Warm (21 days)
- C — Cool (45 days)
- Long Term Nurture (90 days)
- Sphere/Past Clients (quarterly)$md$
 WHERE module_id = '5dd033f8-0f66-4ed9-8caa-57ce57089372' AND slide_number = 3;

-- ASSOCIATE: insert content slide 4
INSERT INTO public.launchpad_slides (module_id, slide_number, title, slide_type, body) VALUES
('5dd033f8-0f66-4ed9-8caa-57ce57089372', 4, 'What''s Actually New Here', 'content', $md$- List accuracy is not just hygiene here — it feeds our AI re-engagement tool directly. A lead sitting in the wrong list breaks that tool's ability to know who has actually gone quiet.
- HANDRAISERS — AI ENGAGED is our AI tool's output queue. Work it like CALL NOW: same day, same hour.
- Our tag categories are specific to us. Do not assume a prior brokerage's tagging habits transfer.
- Prospecting scripts (FSBO, expired, cold calling/door knocking, sphere growth) are taught through scripting and roleplay with your mentor. It is our specific approach, and it is worth a session even with experience.
- The Lead Day Pond is a shared pond, not a personal list. Each agent is assigned a weekday and works every lead in the pond that day. This is likely a new structure regardless of prior brokerage — confirm your assigned day with your mentor.$md$);

-- ASSOCIATE: PA -> 5, KC -> 6
UPDATE public.launchpad_slides SET slide_number = 5, title = 'Practice Assignment', body = $md$1. Review your own database with your mentor and confirm your tags match our five categories correctly.
2. Find a lead in HANDRAISERS — AI ENGAGED (yours or a teammate's, with permission) and discuss the right speed and tone of follow-up.
3. Roleplay one prospecting script (FSBO, expired, or cold call) with your mentor to calibrate to our specific approach.
4. Confirm your assigned Lead Day with your mentor.$md$
 WHERE module_id = '5dd033f8-0f66-4ed9-8caa-57ce57089372' AND slide_number = 106;

UPDATE public.launchpad_slides SET slide_number = 6, title = 'Knowledge Check', body = $md$1. Name our five tag categories.
2. Why does list membership accuracy matter more here than at a typical brokerage?
3. A lead just responded to an AI re-engagement message — what list is it in, and how fast should you respond?
4. What is the Lead Day Pond, and what is the risk of missing your assigned day?$md$
 WHERE module_id = '5dd033f8-0f66-4ed9-8caa-57ce57089372' AND slide_number = 107;
