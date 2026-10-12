export interface ConfigParamItem {
  name: string;
  group: string;
  type: 'boolean' | 'integer' | 'string' | 'enum' | 'bytes';
  default: any;
  min?: number;
  max?: number;
  enumOptions?: string[];
  unit?: string;
  mutableAtRuntime: boolean;
  description: string;
  currentValue: any;
  isChangedFromDefault: boolean;
}

export interface ConfigRollbackResult {
  success: boolean;
  parameter?: string;
  rolledBackTo?: any;
  command?: string;
  message?: string;
}
