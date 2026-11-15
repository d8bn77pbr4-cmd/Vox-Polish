import { createRoot } from 'react-dom/client';
import './ui/theme.css';
import { App } from './App';
import { registerMaterialPresets } from './core/model';
import { MATERIAL_PRESETS } from './core/textile/materials';
import { appStore } from './state/store';
import { projectStore, startAutosave } from './state/persistence';
import { installShortcuts } from './ui/shortcuts';
import './render2d/raster';
import { fitApi } from './views/FitView';

registerMaterialPresets(() => MATERIAL_PRESETS);
startAutosave(appStore, projectStore);
installShortcuts();
(window as unknown as { toile: unknown }).toile = { appStore, fitApi };
createRoot(document.getElementById('root')!).render(<App />);
