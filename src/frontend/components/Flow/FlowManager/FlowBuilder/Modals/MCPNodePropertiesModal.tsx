"use client";

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField, // Keep TextField
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Box,
  IconButton,
  Divider,
  FormHelperText,
  Grid,
  Paper,
  Radio,
  RadioGroup,
  FormControlLabel,
  Checkbox,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Switch,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import Tooltip from '@mui/material/Tooltip';
import { FlowNode } from '@/frontend/types/flow/flow';
import  EnvEditor  from '@/frontend/components/mcp/MCPEnvManager/EnvEditor';
import { createLogger } from '@/utils/logger/index';

const logger = createLogger('frontend/components/Flow/FlowManager/FlowBuilder/Modals/MCPNodePropertiesModal');
import { useServerStatus } from '@/frontend/hooks/useServerStatus';
import { useServerTools } from '@/frontend/hooks/useServerTools';

interface MCPNodePropertiesModalProps {
  open: boolean;
  node: FlowNode | null;
  onClose: () => void;
  onSave: (nodeId: string, data: any) => void;
}

export const MCPNodePropertiesModal = ({ open, node, onClose, onSave }: MCPNodePropertiesModalProps) => {
  // Clone node data to avoid direct mutation
  const [nodeData, setNodeData] = useState<{
    label: string;
    type: string;
    description?: string;
    properties: Record<string, any>;
  } | null>(null);

  // Get server status using the hook
  const { 
    servers, 
    isLoading: isLoadingServers, 
    loadError, 
    retryServer 
  } = useServerStatus();
  
  // State for the selected server
  // State for tracking which servers are being retried
  const [retryingServers, setRetryingServers] = useState<Record<string, boolean>>({});
  
  // Get tools for the selected server using the hook
  const { 
    tools: mcpTools, 
    isLoading: isLoadingTools, 
    error: toolsError,
    loadTools
  } = useServerTools(nodeData?.properties?.boundServer || ''); // Use derived value directly

  // Load node data when node changes
  useEffect(() => {
    if (node) {
      setNodeData({
        ...node.data,
        properties: { ...node.data.properties }
      });
      // If there's a bound server, ensure it's part of the initial nodeData
      // No need to call setSelectedServer here anymore
    }
  }, [node, open]);

  // Get selected server name from nodeData (can be used elsewhere if needed)
  const selectedServer = nodeData?.properties?.boundServer || '';

  // Helper function to initialize enabled tools
  const initializeEnabledTools = (tools: any[]) => {
    if (!nodeData) return;
    
    const enabledToolsFromProps = nodeData.properties.enabledTools || [];
    if (enabledToolsFromProps.length === 0 && tools.length > 0) {
      // If no tools were previously enabled, enable all by default
      logger.debug('Enabling all tools by default');
      setNodeData(prev => {
        if (!prev) return null;
        return {
          ...prev,
          properties: {
            ...prev.properties,
            enabledTools: tools.map((tool) => tool.name)
          }
        };
      });
    }
  };

  // Initialize enabled tools when tools change
  useEffect(() => {
    if (mcpTools && mcpTools.length > 0) {
      initializeEnabledTools(mcpTools);
    }
  }, [mcpTools]);

  const handlePropertyChange = (key: string, value: any) => {
    setNodeData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        properties: {
          ...prev.properties,
          [key]: value,
        },
      };
    });
  };

  // Handle label change
  const handleLabelChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setNodeData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        label: event.target.value,
      };
    });
  };

  const handleSave = () => {
    if (node && nodeData) {
      onSave(node.id, nodeData);
      onClose();
    }
  };

  // Handle retrying a server connection
  const handleRetryServer = async (serverName: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    
    logger.debug(`Retrying server: ${serverName}`);
    
    // Set retrying state for this server
    setRetryingServers(prev => ({
      ...prev,
      [serverName]: true
    }));
    
    try {
      // Call the retry function from the hook
      await retryServer(serverName);
      
      // If this is the selected server, reload its tools
      if (serverName === selectedServer) {
        loadTools(true); // Force reload
      }
      
      return true;
    } catch (error) {
      logger.warn(`Failed to retry server ${serverName}: ${error}`);
      return false;
    } finally {
      // Reset retrying state after a short delay
      setTimeout(() => {
        setRetryingServers(prev => ({
          ...prev,
          [serverName]: false
        }));
      }, 500);
    }
  };

  const handleServerSelect = (serverName: string) => {
    logger.debug(`Server selected: ${serverName}`);
    logger.debug(`Server selected: ${serverName}`);
    // Update selectedServer state if needed (though it's derived now)
    // setSelectedServer(serverName); // No longer needed if derived

    setNodeData((prev) => {
      if (!prev) return null;
      // Remove automatic label update
      // const server = servers.find(s => s.name === serverName);
      // const newLabel = server ? server.name : prev.label;

      return {
        ...prev,
        // label: newLabel, // REMOVED: Label is now manually controlled
        properties: {
          ...prev.properties,
          boundServer: serverName,
          // Reset enabled tools when server changes? Consider this.
          // enabledTools: [], // Optional: Reset tools on server change
        },
      };
    });
  };
  
  const handleToolToggle = (toolName: string) => {
    logger.debug(`Tool toggled: ${toolName}`);
    setNodeData((prev) => {
      if (!prev) return null;
      
      const currentEnabledTools = prev.properties.enabledTools || [];
      let newEnabledTools: string[];
      
      if (currentEnabledTools.includes(toolName)) {
        // Remove tool if already enabled
        newEnabledTools = currentEnabledTools.filter((name: string) => name !== toolName);
      } else {
        // Add tool if not already enabled
        newEnabledTools = [...currentEnabledTools, toolName];
      }
      
      return {
        ...prev,
        properties: {
          ...prev.properties,
          enabledTools: newEnabledTools,
        },
      };
    });
  };
  
  const handleSaveEnv = async (env: Record<string, string | { value: string; metadata: { isSecret: boolean } }>) => {
    logger.debug('Environment variables saved');
    setNodeData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        properties: {
          ...prev.properties,
          env,
        },
      };
    });
  };

  if (!node || !nodeData) return null;

  const boundServer = nodeData.properties?.boundServer || '';
  const enabledTools = nodeData.properties?.enabledTools || [];

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { 
          borderTop: 5, 
          borderColor: 'info.main',
          height: '80vh',
          maxHeight: '80vh'
        }
      }}
    >
      <DialogTitle component="div">
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">
            {nodeData.label || 'MCP Node'} Properties
          </Typography>
          <IconButton edge="end" color="inherit" onClick={onClose} aria-label="close">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <Divider />

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', p: 3, overflow: 'auto' }}>
        {/* Node Label Input */}
        <TextField
          fullWidth
          label="Node Label"
          value={nodeData.label || ''}
          onChange={handleLabelChange}
          margin="normal"
          helperText="The display name for this node on the canvas"
          sx={{ mb: 2 }} // Add some bottom margin
        />

        {/* Bind to MCP Server */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle1" gutterBottom>
            Bind to MCP Server
          </Typography>
          
          {isLoadingServers ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={20} />
              <Typography color="text.secondary">Loading MCP servers...</Typography>
            </Box>
          ) : loadError ? (
            <Typography color="error">{loadError}</Typography>
          ) : servers.length === 0 ? (
            <Typography color="text.secondary">No MCP servers available. Add some in the MCP Manager.</Typography>
          ) : (
            <>
              <FormControl component="fieldset" fullWidth>
                <RadioGroup
                  value={boundServer}
                  onChange={(e) => handleServerSelect(e.target.value)}
                >
                  <Grid container spacing={2}>
                    {servers.map((server) => (
                      <Grid item xs={12} sm={6} key={server.name}>
                        <Paper 
                          elevation={1} 
                          sx={{ 
                            p: 2, 
                            border: boundServer === server.name ? 2 : 0,
                            borderColor: 'primary.main',
                            opacity: server.status === 'connected' ? 1 : 0.6
                          }}
                        >
                        <Box sx={{ display: 'flex', width: '100%', alignItems: 'flex-start' }}>
                          <FormControlLabel
                            value={server.name}
                            control={<Radio />}
                            label={
                              <Box>
                                <Typography variant="subtitle2">{server.name}</Typography>
                                <Typography variant="caption" color="text.secondary" display="block">
                                  {server.path}
                                </Typography>
                                <Typography 
                                  variant="caption" 
                                  color={
                                    server.status === 'connected' ? 'success.main' : 
                                    server.status === 'error' ? 'error.main' : 'text.secondary'
                                  }
                                >
                                  Status: {server.status}
                                </Typography>
                              </Box>
                            }
                            sx={{ width: 'calc(100% - 40px)', m: 0 }}
                          />
                          <Tooltip title="Retry connection">
                            <IconButton 
                              size="small" 
                              onClick={(e) => handleRetryServer(server.name, e)}
                              disabled={retryingServers[server.name]}
                              sx={{ mt: 1 }}
                            >
                              {retryingServers[server.name] ? (
                                <CircularProgress size={16} />
                              ) : (
                                <RefreshIcon fontSize="small" />
                              )}
                            </IconButton>
                          </Tooltip>
                        </Box>
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                </RadioGroup>
                <FormHelperText>
                  {boundServer ? 
                    `This node will use the "${boundServer}" MCP server for processing.` : 
                    "Select an MCP server to bind this node to."}
                </FormHelperText>
              </FormControl>
            </>
          )}
        </Box>
        
        {/* Description field - kept */}
        <TextField
          fullWidth
          label="Description"
          value={nodeData.description || ''}
          onChange={(e) => setNodeData({ ...nodeData, description: e.target.value })}
          margin="normal"
          multiline
          rows={2}
          helperText="This description will be displayed on the node"
        />
        
        {/* Allowed Tools section - new */}
        {boundServer && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="subtitle1" gutterBottom>
              Allowed Tools
            </Typography>
            
            {/* Show message if server is disconnected */}
            {servers.find(s => s.name === boundServer)?.status !== 'connected' && (
              <Box sx={{ mb: 2, p: 2, bgcolor: 'error.light', borderRadius: 1 }}>
                <Typography color="error.dark">
                  Server is disconnected. Tools cannot be fetched. Please retry the connection.
                </Typography>
                <Button 
                  variant="outlined" 
                  size="small" 
                  color="primary" 
                  startIcon={retryingServers[boundServer] ? <CircularProgress size={16} /> : <RefreshIcon />}
                  onClick={() => handleRetryServer(boundServer)}
                  disabled={retryingServers[boundServer]}
                  sx={{ mt: 1 }}
                >
                  Retry Connection
                </Button>
              </Box>
            )}
            
            {isLoadingTools ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={20} />
                <Typography color="text.secondary">Loading tools...</Typography>
              </Box>
            ) : toolsError ? (
              <Typography color="error">{toolsError}</Typography>
            ) : !mcpTools || mcpTools.length === 0 ? (
              <Typography color="text.secondary">
                {servers.find(s => s.name === boundServer)?.status === 'connected' 
                  ? "No tools available for this MCP server." 
                  : "Connect to the server to view available tools."}
              </Typography>
            ) : (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Select which tools this node will have access to. This helps limit the tools available to connected process nodes.
                </Typography>
                
                <List>
                  {mcpTools.map((tool) => (
                    <ListItem key={tool.name} sx={{ py: 0 }}>
                      <ListItemIcon sx={{ minWidth: 42 }}>
                        <Switch
                          edge="start"
                          checked={enabledTools.includes(tool.name)}
                          onChange={() => handleToolToggle(tool.name)}
                        />
                      </ListItemIcon>
                      <ListItemText 
                        primary={tool.name}
                        secondary={tool.description}
                        primaryTypographyProps={{ fontWeight: 'medium' }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Box>
        )}
        
        {/* Environment Variables section - new */}
        {boundServer && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="subtitle1" gutterBottom>
              Environment Variables
            </Typography>
            
            <EnvEditor
              serverName={boundServer}
              initialEnv={nodeData.properties?.env || {}}
              onSave={handleSaveEnv}
            />
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MCPNodePropertiesModal;
