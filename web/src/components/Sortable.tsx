import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

function Item({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button type="button" ref={setActivatorNodeRef} className="grip" aria-label="Trascina per riordinare" {...attributes} {...listeners}>
      <Icon name="grip" />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      className={`sortable${isDragging ? ' dragging' : ''}`}
      style={{ transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined, transition }}
    >
      {children(handle)}
    </div>
  );
}

/** Elenco verticale riordinabile trascinando la maniglia (anche da tastiera). */
export function SortableList<T extends { id: string }>({ items, onReorder, children }: {
  items: T[];
  onReorder: (items: T[]) => void;
  children: (item: T, handle: ReactNode, index: number) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from >= 0 && to >= 0) onReorder(arrayMove(items, from, to));
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="list">
          {items.map((item, index) => (
            <Item key={item.id} id={item.id}>{(handle) => children(item, handle, index)}</Item>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
