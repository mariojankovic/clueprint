/**
 * DevTools Panel Script
 * Mounts the Svelte panel component
 */

import { mount } from 'svelte';
import Panel from './Panel.svelte';

mount(Panel, {
  target: document.getElementById('app')!,
});
