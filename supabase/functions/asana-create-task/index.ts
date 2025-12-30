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

    const body = await req.json();
    const { action } = body;

    // Handle different actions
    if (action === 'get_projects') {
      return await getProjects(ASANA_ACCESS_TOKEN);
    } else if (action === 'get_custom_fields') {
      return await getCustomFields(ASANA_ACCESS_TOKEN, body.project_id);
    } else {
      return await createTask(ASANA_ACCESS_TOKEN, body);
    }

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

async function getProjects(token: string) {
  // First get workspaces
  const workspacesResponse = await fetch('https://app.asana.com/api/1.0/workspaces', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!workspacesResponse.ok) {
    throw new Error('Failed to fetch workspaces');
  }

  const workspacesData = await workspacesResponse.json();
  const allProjects: any[] = [];

  // Fetch projects from each workspace
  for (const workspace of workspacesData.data) {
    const projectsResponse = await fetch(
      `https://app.asana.com/api/1.0/workspaces/${workspace.gid}/projects?opt_fields=name,gid`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (projectsResponse.ok) {
      const projectsData = await projectsResponse.json();
      allProjects.push(...projectsData.data.map((p: any) => ({
        ...p,
        workspace_name: workspace.name,
      })));
    }
  }

  console.log('Fetched projects:', allProjects.length);

  return new Response(JSON.stringify({ projects: allProjects }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getCustomFields(token: string, projectId: string) {
  if (!projectId) {
    return new Response(JSON.stringify({ custom_fields: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const response = await fetch(
    `https://app.asana.com/api/1.0/projects/${projectId}/custom_field_settings?opt_fields=custom_field.name,custom_field.gid,custom_field.type,custom_field.enum_options`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to fetch custom fields:', error);
    throw new Error('Failed to fetch custom fields');
  }

  const data = await response.json();
  const customFields = data.data.map((cf: any) => cf.custom_field);
  
  console.log('Fetched custom fields for project:', projectId, customFields.length);

  return new Response(JSON.stringify({ custom_fields: customFields }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function createTask(token: string, body: any) {
  const { 
    form_type, 
    property_address, 
    client_name, 
    agent_name,
    notes,
    project_id,
    workspace_id,
    custom_fields,
    // Form-specific data
    open_house_date,
    open_house_time,
    list_price,
    purchase_price,
    closing_date,
    vendor_name,
    invoice_amount,
  } = body;

  console.log('Creating Asana task for:', form_type, property_address || client_name);
  console.log('Received custom_fields:', JSON.stringify(custom_fields));
  console.log('Project ID:', project_id);
  // Build task name based on form type
  let taskName = '';
  switch (form_type) {
    case 'open_house':
      taskName = `Open House: ${property_address || 'Unknown Address'}`;
      break;
    case 'invoice':
      taskName = `Invoice: ${vendor_name || client_name || 'Unknown'}`;
      break;
    case 'listing':
      taskName = `New Listing: ${property_address || 'Unknown Address'}`;
      break;
    case 'buyer':
      taskName = `Buyer Transaction: ${client_name || 'Unknown Client'}`;
      break;
    case 'test':
      taskName = `Test Connection: ${client_name || 'Test'}`;
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
    open_house_date ? `Date: ${open_house_date} ${open_house_time || ''}` : null,
    list_price ? `List Price: $${list_price}` : null,
    purchase_price ? `Purchase Price: $${purchase_price}` : null,
    closing_date ? `Closing Date: ${closing_date}` : null,
    vendor_name ? `Vendor: ${vendor_name}` : null,
    invoice_amount ? `Amount: $${invoice_amount}` : null,
    notes ? `Notes: ${notes}` : null,
    `Submitted: ${new Date().toLocaleString()}`,
    `Source: RealtyHub Submissions`
  ].filter(Boolean).join('\n');

  // First, get workspaces if no workspace_id provided
  let targetWorkspaceId = workspace_id;
  if (!targetWorkspaceId && !project_id) {
    const workspacesResponse = await fetch('https://app.asana.com/api/1.0/workspaces', {
      headers: {
        'Authorization': `Bearer ${token}`,
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
    }
  };

  // Add workspace or project
  if (project_id) {
    taskData.data.projects = [project_id];
  } else if (targetWorkspaceId) {
    taskData.data.workspace = targetWorkspaceId;
  }

  // Add custom fields if provided
  if (custom_fields && Object.keys(custom_fields).length > 0) {
    taskData.data.custom_fields = custom_fields;
    console.log('Adding custom fields:', custom_fields);
  }

  // Add due date if closing date provided
  if (closing_date) {
    taskData.data.due_on = closing_date;
  }

  const createResponse = await fetch('https://app.asana.com/api/1.0/tasks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
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
}
