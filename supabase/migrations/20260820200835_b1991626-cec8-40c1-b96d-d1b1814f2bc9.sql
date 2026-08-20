BEGIN;

UPDATE launchpad_slides
SET title = 'Photography & Cleaning',
    body = $body1$
A preferred vendor is always the client''s choice, never a requirement.

For OAKHAUS specifically, see Module 2''s financial-benefit disclosure section before recommending it — that relationship must be disclosed to sellers in writing before it''s used.

Photography:
- JM Media (Josh) — our go-to photographer, 905-745-1335
- Wayzie Media — 289-302-0388, serves Hamilton, Niagara, Haldimand region

Cleaning:
- Lisa — cleaner in the Niagara Region, no phone on file yet, worth asking if she''d travel to Hamilton (confirm with mentor)
- Tatiana — 519-880-4580, tatianabrown421@gmail.com, Waterloo Region and probably surrounding
- Dash Cleaning (Pam Milne) — 437-577-5658, KW (Kitchener-Waterloo)
- Kasey McDonough — 226-791-8882
$body1$
WHERE module_id = '767ffb05-c72d-4a3f-9284-50841f3a5bfd'
  AND slide_number = 1;

UPDATE launchpad_slides
SET title = 'Home Inspectors & Staging',
    body = $body2$
Home Inspectors:
- Chad Hussey, Pillar to Post — 519-580-1409, chad.hussey@pillartopost.com, kitchenerwaterloo.pillartopost.com, they go everywhere
- HomeWorks Home Inspectors — 905-630-8775, dan@homeworksinspections.com, homeworksinspections.com
- Regional Property Inspections (Peter Blackwell) — 519-241-4556, rpi.scheduling@gmail.com / peter@peterblackwell.com, kitchener-home-inspector.com
- Baseline Inspections (Rod) — 519-656-2402, baselineinspections.com
- Heeley Home Inspections (Mike) — 519-835-0622, mike@heeleyinspections.com, heeleyinspections.com

Staging:
- Elle Cee Staging (Lilly Cordeiro) — 519-722-5481, info@elleceestaging.com, www.elleceestaging.com
- Staged with Kare (Karen) — 226-505-8377, clientcare@stagedwithkare.ca, www.stagedwithkare.ca
- One Stop Home Staging (Shawna Sherk) — 519-410-0098, onestophomestaging@outlook.com
$body2$
WHERE module_id = '767ffb05-c72d-4a3f-9284-50841f3a5bfd'
  AND slide_number = 2;

UPDATE launchpad_slides
SET title = 'Moving, Junk Removal & Legal',
    body = $body3$
Moving & Junk Removal:
- Victor — 519-221-0201, junk removal and moving
- Ricky''s Moving — 519-502-4932, KW and beyond
- BG Moving — 226-368-1676, KW

Legal (Lawyers):
- Lennox and Penny (Chris Baillargeon) — 519-653-5747, Cambridge
- Travers Law — 1-877-744-2281, info@traverslaw.ca, offices at 423 King St N Waterloo N2J 2Z5, 380 Woolwich St Guelph, 688 Hespeler Rd #2C Cambridge
- Hussein Law Office Professional Corporation (Victor) — 519-744-8585, victor@vhlaw.ca, 275 Lancaster St W Kitchener
- Rabideau Law — 1-888-820-1321, info@rabideaulaw.ca, 62 Regina St N Waterloo N2J 3A5
$body3$
WHERE module_id = '767ffb05-c72d-4a3f-9284-50841f3a5bfd'
  AND slide_number = 3;

COMMIT;