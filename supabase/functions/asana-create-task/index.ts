import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ASANA_ACCESS_TOKEN = Deno.env.get('ASANA_ACCESS_TOKEN');
    if (!ASANA_ACCESS_TOKEN) {
      throw new Error('ASANA_ACCESS_TOKEN is not configured');
    }

    const { 
      form_type, 
      property_address, 
      client_name, 
      agent_name,
      notes,
      project_id,
      workspace_id 
    } = await req.json();

    console.log('Creating Asana task for:', form_type, property_address || client_name);

    // Build task name based on form type
    let taskName = '';
    switch (form_type) {
      case 'open_house':
        taskName = `Open House: ${property_address || 'Unknown Address'}`;
        break;
      case 'invoice':
        taskName = `Invoice Submission: ${client_name || 'Unknown'}`;
        break;
      case 'listing':
        taskName = `New Listing: ${property_address || 'Unknown Address'}`;
        break;
      case 'buyer':
        taskName = `Buyer Transaction: ${client_name || 'Unknown Client'}`;
        break;
      default:
        taskName = `Submission: ${form_type}`;
    }

    // Build task notes/description
    const taskNotes = [
      `Form Type: ${form_type}`,
      property_address ? `Property: ${property_address}` : null,
      client_name ? `Client: ${client_name}` : null,
      agent_name ? `Agent: ${agent_name}` : null,
      notes ? `Notes: ${notes}` : null,
      `Submitted: ${new Date().toLocaleString()}`,
      `Source: RealtyHub Submissions`
    ].filter(Boolean).join('\n');

    // First, get workspaces if no workspace_id provided
    let targetWorkspaceId = workspace_id;
    if (!targetWorkspaceId) {
      const workspacesResponse = await fetch('https://app.asana.com/api/1.0/workspaces', {
        headers: {
          'Authorization': `Bearer ${ASANA_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });

      if (!workspacesResponse.ok) {
        const error = await workspacesResponse.text();
        console.error('Failed to fetch workspaces:', error);
        throw new Error('Failed to fetch Asana workspaces');
      }

      const workspacesData = await workspacesResponse.json();
      if (workspacesData.data && workspacesData.data.length > 0) {
        targetWorkspaceId = workspacesData.data[0].gid;
        console.log('Using workspace:', targetWorkspaceId);
      } else {
        throw new Error('No Asana workspaces found');
      }
    }

    // Create the task
    const taskData: any = {
      data: {
        name: taskName,
        notes: taskNotes,
        workspace: targetWorkspaceId,
      }
    };

    // Add project if provided
    if (project_id) {
      taskData.data.projects = [project_id];
    }

    const createResponse = await fetch('https://app.asana.com/api/1.0/tasks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ASANA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(taskData),
    });

    if (!createResponse.ok) {
      const error = await createResponse.text();
      console.error('Failed to create task:', error);
      throw new Error(`Failed to create Asana task: ${error}`);
    }

    const result = await createResponse.json();
    console.log('Task created successfully:', result.data?.gid);

    return new Response(JSON.stringify({ 
      success: true, 
      task: result.data 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in asana-create-task:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
