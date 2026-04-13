import { BodySystem, Body } from '../BodySystem.js';

export class BodyList {
  private container: HTMLElement;
  private listEl: HTMLElement;
  private searchEl: HTMLInputElement;
  private selectedId: string | null = null;
  private filter = '';

  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
  onFocus?:  (body: Body) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Bodies</span>
        <button id="btn-add-body" class="icon-btn" title="Add body">+</button>
      </div>
      <input id="body-search" class="search-input" type="text" placeholder="Search…" />
      <div id="body-list-items" class="body-list-scroll"></div>
    `;
    this.listEl   = this.container.querySelector('#body-list-items')!;
    this.searchEl = this.container.querySelector('#body-search')!;
    this.searchEl.addEventListener('input', () => {
      this.filter = this.searchEl.value.toLowerCase();
    });
  }

  setSelectedId(id: string | null): void {
    this.selectedId = id;
  }

  render(bodySystem: BodySystem): void {
    const bodies = bodySystem.bodies;
    const filtered = this.filter
      ? bodies.filter(b => b.name.toLowerCase().includes(this.filter) || b.type.includes(this.filter))
      : bodies;

    // Group by type for display order
    const order: Body['type'][] = ['star', 'planet', 'moon', 'rocket', 'asteroid'];
    const sorted = [...filtered].sort((a, b) => {
      const ai = order.indexOf(a.type);
      const bi = order.indexOf(b.type);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    // Rebuild only changed items for performance
    this.listEl.innerHTML = '';
    for (const body of sorted) {
      const item = document.createElement('div');
      item.className = 'body-item' + (body.id === this.selectedId ? ' selected' : '');
      item.dataset.id = body.id;

      const dot = document.createElement('span');
      dot.className = 'body-dot';
      dot.style.background = body.color;

      const name = document.createElement('span');
      name.className = 'body-name';
      name.textContent = body.name;

      const type = document.createElement('span');
      type.className = 'body-type';
      type.textContent = body.type;

      const del = document.createElement('button');
      del.className = 'del-btn';
      del.textContent = '×';
      del.title = 'Delete';
      del.addEventListener('click', e => {
        e.stopPropagation();
        this.onDelete?.(body.id);
      });

      item.appendChild(dot);
      item.appendChild(name);
      item.appendChild(type);
      item.appendChild(del);

      item.addEventListener('click', () => {
        this.selectedId = body.id;
        this.onSelect?.(body.id);
      });

      item.addEventListener('dblclick', () => {
        this.onFocus?.(body);
      });

      this.listEl.appendChild(item);
    }

    // Count badge
    const header = this.container.querySelector('.panel-title');
    if (header) header.textContent = `Bodies (${bodies.length})`;
  }
}
