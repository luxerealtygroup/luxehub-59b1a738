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
    } else if (action === 'get_tasks') {
      return await getTasks(ASANA_ACCESS_TOKEN, body.project_id);
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

async function getTasks(token: string, projectId: string) {
  const cleanProjectId = projectId?.trim();
  if (!cleanProjectId) {
    return new Response(JSON.stringify({ tasks: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('Fetching tasks for project:', cleanProjectId);

  const response = await fetch(
    `https://app.asana.com/api/1.0/projects/${cleanProjectId}/tasks?opt_fields=name,due_on,completed,notes,custom_fields,permalink_url`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to fetch tasks:', error);
    throw new Error('Failed to fetch tasks from Asana');
  }

  const data = await response.json();
  console.log('Fetched tasks:', data.data?.length || 0);

  return new Response(JSON.stringify({ tasks: data.data || [] }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function uploadAttachmentToTask(token: string, taskGid: string, fileUrl: string, fileName: string) {
  try {
    console.log(`Uploading attachment: ${fileName} from ${fileUrl}`);
    
    // Fetch the file from the URL
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      console.error(`Failed to fetch file: ${fileUrl}`, fileResponse.status);
      return null;
    }

    const fileBlob = await fileResponse.blob();
    
    // Create form data for multipart upload
    const formData = new FormData();
    formData.append('file', fileBlob, fileName);

    // Upload to Asana
    const uploadResponse = await fetch(`https://app.asana.com/api/1.0/tasks/${taskGid}/attachments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      console.error(`Failed to upload attachment to Asana: ${error}`);
      return null;
    }

    const result = await uploadResponse.json();
    console.log(`Attachment uploaded successfully: ${result.data?.gid}`);
    return result.data;
  } catch (error) {
    console.error(`Error uploading attachment: ${error}`);
    return null;
  }
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
    attachment_urls, // Array of { url: string, name: string }
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
  console.log('Attachment URLs:', JSON.stringify(attachment_urls));

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

  // Fetch custom field metadata to properly format values
  let formattedCustomFields: Record<string, any> = {};
  if (custom_fields && Object.keys(custom_fields).length > 0 && project_id) {
    try {
      const cfResponse = await fetch(
        `https://app.asana.com/api/1.0/projects/${project_id}/custom_field_settings?opt_fields=custom_field.name,custom_field.gid,custom_field.type,custom_field.enum_options`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (cfResponse.ok) {
        const cfData = await cfResponse.json();
        const fieldMetadata = cfData.data.reduce((acc: any, cf: any) => {
          acc[cf.custom_field.gid] = cf.custom_field;
          return acc;
        }, {});

        console.log('Custom field metadata loaded for', Object.keys(fieldMetadata).length, 'fields');

        // Format each custom field value based on its type
        for (const [fieldGid, value] of Object.entries(custom_fields)) {
          const fieldMeta = fieldMetadata[fieldGid];
          if (!fieldMeta) {
            console.log(`Skipping unknown field: ${fieldGid}`);
            continue;
          }

          console.log(`Processing field ${fieldMeta.name} (${fieldMeta.type}): ${value}`);

          switch (fieldMeta.type) {
            case 'text':
              formattedCustomFields[fieldGid] = String(value);
              break;
            case 'number':
              formattedCustomFields[fieldGid] = parseFloat(String(value).replace(/[^0-9.-]/g, '')) || 0;
              break;
            case 'enum':
              // Find matching enum option by name (case-insensitive)
              const enumOption = fieldMeta.enum_options?.find(
                (opt: any) => opt.name.toLowerCase() === String(value).toLowerCase()
              );
              if (enumOption) {
                formattedCustomFields[fieldGid] = enumOption.gid;
                console.log(`Mapped enum "${value}" to GID: ${enumOption.gid}`);
              } else {
                console.log(`No matching enum option for "${value}" in field ${fieldMeta.name}. Available options:`, fieldMeta.enum_options?.map((o: any) => o.name));
              }
              break;
            case 'date':
              // Asana date fields require an object with "date" property
              if (value) {
                formattedCustomFields[fieldGid] = { date: String(value) };
                console.log(`Formatted date: ${JSON.stringify(formattedCustomFields[fieldGid])}`);
              }
              break;
            default:
              // For other types, try text format
              formattedCustomFields[fieldGid] = String(value);
          }
        }
      }
    } catch (cfError) {
      console.error('Error fetching custom field metadata:', cfError);
      // Fall back to text-only fields
    }
  }

  console.log('Formatted custom fields:', JSON.stringify(formattedCustomFields));

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

  // Add custom fields if any were successfully formatted
  if (Object.keys(formattedCustomFields).length > 0) {
    taskData.data.custom_fields = formattedCustomFields;
    console.log('Adding custom fields:', JSON.stringify(formattedCustomFields));
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
  const taskGid = result.data?.gid;
  console.log('Task created successfully:', taskGid);

  // Upload attachments if provided
  let uploadedAttachments: any[] = [];
  if (attachment_urls && Array.isArray(attachment_urls) && attachment_urls.length > 0 && taskGid) {
    console.log(`Uploading ${attachment_urls.length} attachments to task ${taskGid}`);
    
    for (const attachment of attachment_urls) {
      const uploaded = await uploadAttachmentToTask(token, taskGid, attachment.url, attachment.name);
      if (uploaded) {
        uploadedAttachments.push(uploaded);
      }
    }
    
    console.log(`Successfully uploaded ${uploadedAttachments.length} attachments`);
  }

  return new Response(JSON.stringify({ 
    success: true, 
    task: result.data,
    attachments_uploaded: uploadedAttachments.length,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
