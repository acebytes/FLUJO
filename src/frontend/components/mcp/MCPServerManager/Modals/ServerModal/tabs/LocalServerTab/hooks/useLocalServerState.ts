'use client';

import { useState, useEffect } from 'react';
import { MCPServerConfig, MCPStdioConfig, MCPWebSocketConfig, MCPSSEConfig, MCPStreamableConfig, EnvVarValue } from '@/shared/types/mcp/mcp';
import { MessageState } from '../../../types';

// Type guards
export const isStdioConfig = (config: MCPServerConfig): config is MCPStdioConfig => {
  return config.transport === 'stdio';
};

export const isWebSocketConfig = (config: MCPServerConfig): config is MCPWebSocketConfig => {
  return config.transport === 'websocket';
};

export const isSSEConfig = (config: MCPServerConfig): config is MCPSSEConfig => {
  return config.transport === 'sse';
};

export const isStreamableConfig = (config: MCPServerConfig): config is MCPStreamableConfig => {
  return config.transport === 'streamable';
};

interface UseLocalServerStateProps {
  initialConfig?: MCPServerConfig | null;
  isOpen?: boolean;
}

export const useLocalServerState = ({ initialConfig, isOpen = true }: UseLocalServerStateProps) => {
  // Track which sections are expanded
  const [expandedSections, setExpandedSections] = useState({
    define: true,
    build: true,
    run: true
  });

  // Initialize with stdio transport by default
  const [localConfig, setLocalConfig] = useState<MCPServerConfig>({
    name: '',
    command: '',
    args: [],
    env: {},
    disabled: false,
    autoApprove: [],
    rootPath: '',
    transport: 'stdio',
    _buildCommand: '',
    _installCommand: ''
  } as MCPStdioConfig);
  
  // State for URLs
  const [websocketUrl, setWebsocketUrl] = useState<string>('');
  const [serverUrl, setServerUrl] = useState<string>('');
  
  const [buildCommand, setBuildCommand] = useState<string>('');
  const [installCommand, setInstallCommand] = useState<string>('');
  const [message, setMessage] = useState<MessageState | null>(null);
  const [buildMessage, setBuildMessage] = useState<MessageState | null>(null);
  const [isBuilding, setIsBuilding] = useState<boolean>(false);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);
  const [buildCompleted, setBuildCompleted] = useState<boolean>(false);
  const [installCompleted, setInstallCompleted] = useState<boolean>(false);
  const [isParsingReadme, setIsParsingReadme] = useState<boolean>(false);
  const [isParsingEnv, setIsParsingEnv] = useState<boolean>(false);

  // State for console output
  const [consoleOutput, setConsoleOutput] = useState<string>('');
  const [isConsoleVisible, setIsConsoleVisible] = useState<boolean>(false);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [runCompleted, setRunCompleted] = useState<boolean>(false);
  const [consoleTitle, setConsoleTitle] = useState<string>('Command Output');

  // Update expanded sections
  const setExpandedSection = (section: 'define' | 'build' | 'run', isExpanded: boolean) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: isExpanded
    }));
  };

  // Handle transport type change
  const handleTransportChange = (transport: 'stdio' | 'websocket' | 'sse' | 'streamable') => {
    if (transport === 'websocket') {
      // Convert to websocket config
      setLocalConfig(prev => ({
        name: prev.name,
        disabled: prev.disabled,
        autoApprove: prev.autoApprove,
        rootPath: prev.rootPath,
        env: prev.env,
        _buildCommand: prev._buildCommand,
        _installCommand: prev._installCommand,
        transport: 'websocket',
        websocketUrl: websocketUrl
      } as MCPWebSocketConfig));
    } else if (transport === 'sse') {
      // Convert to SSE config
      setLocalConfig(prev => ({
        name: prev.name,
        disabled: prev.disabled,
        autoApprove: prev.autoApprove,
        rootPath: prev.rootPath,
        env: prev.env,
        _buildCommand: prev._buildCommand,
        _installCommand: prev._installCommand,
        transport: 'sse',
        serverUrl: serverUrl
      } as MCPSSEConfig));
    } else if (transport === 'streamable') {
      // Convert to Streamable config
      setLocalConfig(prev => ({
        name: prev.name,
        disabled: prev.disabled,
        autoApprove: prev.autoApprove,
        rootPath: prev.rootPath,
        env: prev.env,
        _buildCommand: prev._buildCommand,
        _installCommand: prev._installCommand,
        transport: 'streamable',
        serverUrl: serverUrl
      } as MCPStreamableConfig));
    } else {
      // Convert to stdio config
      setLocalConfig(prev => ({
        name: prev.name,
        command: isStdioConfig(prev) ? prev.command : '',
        args: isStdioConfig(prev) ? prev.args : [],
        disabled: prev.disabled,
        autoApprove: prev.autoApprove,
        rootPath: prev.rootPath,
        env: prev.env,
        _buildCommand: prev._buildCommand,
        _installCommand: prev._installCommand,
        transport: 'stdio'
      } as MCPStdioConfig));
    }
  };

  // Handle argument changes
  const handleArgChange = (index: number, value: string) => {
    if (isStdioConfig(localConfig)) {
      setLocalConfig(prev => {
        if (isStdioConfig(prev) && prev.args) {
          return {
            ...prev,
            args: prev.args.map((arg, i) => i === index ? value : arg)
          };
        }
        return prev;
      });
    }
  };

  const addArgField = () => {
    if (isStdioConfig(localConfig)) {
      setLocalConfig(prev => {
        if (isStdioConfig(prev)) {
          const currentArgs = prev.args || [];
          return {
            ...prev,
            args: [...currentArgs, '']
          };
        }
        return prev;
      });
    }
  };

  const removeArgField = (index: number) => {
    if (isStdioConfig(localConfig)) {
      setLocalConfig(prev => {
        if (isStdioConfig(prev) && prev.args) {
          return {
            ...prev,
            args: prev.args.filter((_, i) => i !== index)
          };
        }
        return prev;
      });
    }
  };

  // Handle environment variable changes
  const handleEnvChange = (env: Record<string, EnvVarValue>) => {
    setLocalConfig(prev => {
      // Create a copy of the previous config with the updated env
      const updatedConfig = { ...prev, env };
      
      // Ensure we maintain the correct type
      if (isStdioConfig(prev)) {
        return updatedConfig as MCPStdioConfig;
      } else if (isWebSocketConfig(prev)) {
        return updatedConfig as MCPWebSocketConfig;
      }
      
      return prev;
    });
  };

  // Reset state when modal is opened or initialConfig changes
  useEffect(() => {
    // Default state for a new server
    const defaultConfig: MCPStdioConfig = {
      name: '',
      command: '',
      args: [],
      env: {},
      disabled: false,
      autoApprove: [],
      rootPath: '',
      transport: 'stdio',
      _buildCommand: '',
      _installCommand: ''
    };
    
    // Reset all state values when modal is opened
    if (isOpen) {
      if (initialConfig) {
        // Extract rootPath if it exists
        const rootPath = initialConfig.rootPath || '';
              
        // Create a new config with the extracted rootPath
        const configWithRootPath = {
          ...initialConfig,
          rootPath
        };
        
        setLocalConfig(configWithRootPath);
        
        // Set build and install commands from config if available
        setBuildCommand(initialConfig._buildCommand || '');
        setInstallCommand(initialConfig._installCommand || '');
        
        // Set URLs based on transport type
        if (initialConfig.transport === 'websocket') {
          setWebsocketUrl((initialConfig as MCPWebSocketConfig).websocketUrl || '');
          setServerUrl('');
        } else if (initialConfig.transport === 'sse' || initialConfig.transport === 'streamable') {
          setServerUrl((initialConfig as MCPSSEConfig | MCPStreamableConfig).serverUrl || '');
          setWebsocketUrl('');
        } else {
          setWebsocketUrl('');
          setServerUrl('');
        }
      } else {
        // Reset to default values if no initialConfig
        setLocalConfig(defaultConfig);
        setBuildCommand('');
        setInstallCommand('');
        setWebsocketUrl('');
        setMessage(null);
        setBuildMessage(null);
        setIsBuilding(false);
        setIsInstalling(false);
        setBuildCompleted(false);
        setInstallCompleted(false);
        setIsParsingReadme(false);
        setIsParsingEnv(false);
        setConsoleOutput('');
        setIsConsoleVisible(false);
        setIsRunning(false);
        setRunCompleted(false);
        setConsoleTitle('Command Output');
        setExpandedSections({
          define: true,
          build: true,
          run: true
        });
      }
    }
  }, [isOpen, initialConfig]);

  return {
    // State
    localConfig,
    setLocalConfig,
    websocketUrl,
    setWebsocketUrl,
    serverUrl,
    setServerUrl,
    buildCommand,
    setBuildCommand,
    installCommand,
    setInstallCommand,
    message,
    setMessage,
    buildMessage,
    setBuildMessage,
    isBuilding,
    setIsBuilding,
    isInstalling,
    setIsInstalling,
    buildCompleted,
    setBuildCompleted,
    installCompleted,
    setInstallCompleted,
    isParsingReadme,
    setIsParsingReadme,
    isParsingEnv,
    setIsParsingEnv,
    consoleOutput,
    setConsoleOutput,
    isConsoleVisible,
    setIsConsoleVisible,
    isRunning,
    setIsRunning,
    runCompleted,
    setRunCompleted,
    consoleTitle,
    setConsoleTitle,
    expandedSections,
    setExpandedSections,
    
    // Methods
    handleTransportChange,
    handleArgChange,
    addArgField,
    removeArgField,
    handleEnvChange
  };
};
