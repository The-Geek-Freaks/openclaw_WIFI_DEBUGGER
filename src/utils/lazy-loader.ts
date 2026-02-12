import { createChildLogger } from './logger.js';

const logger = createChildLogger('lazy-loader');

type LazyModule<T> = {
  loaded: boolean;
  instance: T | null;
  load: () => Promise<T>;
};

const moduleCache = new Map<string, LazyModule<unknown>>();

export async function lazyLoad<T>(
  modulePath: string,
  exportName: string
): Promise<T> {
  const cacheKey = `${modulePath}:${exportName}`;
  
  if (moduleCache.has(cacheKey)) {
    const cached = moduleCache.get(cacheKey)!;
    if (cached.loaded && cached.instance) {
      return cached.instance as T;
    }
  }

  logger.debug({ modulePath, exportName }, 'Lazy loading module');
  
  try {
    const module = await import(modulePath);
    const exported = module[exportName] as T;
    
    moduleCache.set(cacheKey, {
      loaded: true,
      instance: exported,
      load: async () => exported,
    });
    
    logger.debug({ modulePath, exportName }, 'Module loaded successfully');
    return exported;
  } catch (err) {
    logger.error({ modulePath, exportName, err }, 'Failed to lazy load module');
    throw err;
  }
}

export function createLazyFactory<T, Args extends unknown[]>(
  modulePath: string,
  className: string
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    const Constructor = await lazyLoad<new (...args: Args) => T>(modulePath, className);
    return new Constructor(...args);
  };
}

export function isModuleLoaded(modulePath: string, exportName: string): boolean {
  const cacheKey = `${modulePath}:${exportName}`;
  const cached = moduleCache.get(cacheKey);
  return cached?.loaded ?? false;
}

export function getLoadedModules(): string[] {
  return Array.from(moduleCache.entries())
    .filter(([, v]) => v.loaded)
    .map(([k]) => k);
}

export function clearModuleCache(): void {
  moduleCache.clear();
  logger.info('Module cache cleared');
}
