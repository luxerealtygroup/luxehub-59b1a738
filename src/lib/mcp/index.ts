import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyPipeline from "./tools/get-my-pipeline";
import getMyDeals from "./tools/get-my-deals";
import getMyWeekly411 from "./tools/get-my-weekly-411";
import addPipelineClient from "./tools/add-pipeline-client";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "luxehub",
  title: "LUXEhub",
  version: "1.0.0",
  instructions:
    "Tools for LUXEhub, a real estate agent hub. Read the signed-in agent's pipeline clients, deals and weekly 4-1-1 accountability entries, and add new pipeline clients. All data is scoped to the signed-in agent.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyPipeline, getMyDeals, getMyWeekly411, addPipelineClient],
});
