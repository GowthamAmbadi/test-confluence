import { useEffect, useState } from 'react';
import { NOTE_CATEGORIES, type NoteCategory } from '../../lib/noteCategories';

export function AddNoteModal({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (note: string, category: NoteCategory) => Promise<void>;
  submitting: boolean;
}) {
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<NoteCategory>('General');

  useEffect(() => {
    if (!open) {
      setNote('');
      setCategory('General');
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-labelledby="add-note-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="add-note-title">Add Internal Note</h3>
        <p className="muted">Notes are append-only and visible to all staff.</p>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as NoteCategory)}>
            {NOTE_CATEGORIES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Note
          <textarea
            className="note-textarea"
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Describe the support interaction…"
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-small" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting || !note.trim()}
            onClick={() => onSubmit(note.trim(), category)}
          >
            {submitting ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>
    </div>
  );
}
