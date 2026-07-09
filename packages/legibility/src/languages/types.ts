export interface TaskSurfaceResult {
   names: Set<string>;
   sourceFiles: Set<string>;
}

export interface LanguageAdapter {
   readonly id: string;
   readonly displayName: string;
   readonly patterns: string[];
   detect(files: string[]): boolean;
   collectTaskSurface(root: string, files: string[]): Promise<TaskSurfaceResult>;
}

export interface AggregatedTaskSurface {
   task_surface: Set<string>;
   task_surface_files: Set<string>;
   entrypoint_files: string[];
}
