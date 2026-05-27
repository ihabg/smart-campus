import React, { useState } from 'react';
import { announcementAPI } from '../../api/index';
import { useAsync } from '../../hooks/index';
import {
  Table, Pagination, Button, Input, Textarea, Modal,
  ConfirmDialog, Badge, Spinner, PlusIcon, EditIcon, TrashIcon, EyeIcon,
} from '../../components/ui/index';
import { formatDate, timeAgo, getErrorMessage } from '../../utils/helpers';
import toast from 'react-hot-toast';

export default function AdminAnnouncementsPage() {
  const [page,       setPage]       = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem,   setEditItem]   = useState(null);
  const [delItem,    setDelItem]    = useState(null);
  const [delLoading, setDelLoading] = useState(false);
  const [preview,    setPreview]    = useState(null);

  const { data, loading, refetch } = useAsync(
    () => announcementAPI.getAll({ page, limit: 15 }),
    [page]
  );
  const items      = data?.announcements || [];
  const pagination = data?.pagination;

  const handleDelete = async () => {
    setDelLoading(true);
    try {
      await announcementAPI.delete(delItem.id);
      toast.success('Announcement deleted');
      setDelItem(null);
      refetch();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setDelLoading(false); }
  };

  const columns = [
    { key: 'title', label: 'Title', render: (v, r) => (
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        {r.is_pinned && <span title="Pinned">📌</span>}
        <span style={{ fontWeight:500 }}>{v}</span>
      </div>
    )},
    { key: 'author_name', label: 'Author', render: v => v || '—' },
    { key: 'is_published', label: 'Status', render: v => <Badge variant={v ? 'green' : 'gray'}>{v ? 'Published' : 'Draft'}</Badge> },
    { key: 'published_at', label: 'Date', render: v => v ? formatDate(v) : '—' },
    { key: 'expires_at',   label: 'Expires', render: v => v ? formatDate(v) : 'Never' },
    { key: 'actions', label: '', render: (_, r) => (
      <div style={{ display:'flex', gap:4 }}>
        <button className="btn btn--ghost btn--sm btn--icon" onClick={() => setPreview(r)} title="Preview"><EyeIcon /></button>
        <button className="btn btn--ghost btn--sm btn--icon" onClick={() => setEditItem({ ...r })} title="Edit"><EditIcon /></button>
        <button className="btn btn--ghost btn--sm btn--icon" onClick={() => setDelItem(r)} title="Delete" style={{ color:'var(--red)' }}><TrashIcon /></button>
      </div>
    )},
  ];

  return (
    <div>
      <div className="page-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <h1 className="page-title">Announcements</h1>
          <p className="page-sub">Publish and manage campus announcements</p>
        </div>
        <Button variant="primary" icon={<PlusIcon />} onClick={() => setShowCreate(true)}>New Announcement</Button>
      </div>

      <div className="card card--no-pad">
        <Table columns={columns} data={items} loading={loading} emptyMessage="No announcements yet" />
        <div style={{ padding:'0 16px' }}><Pagination pagination={pagination} onPageChange={setPage} /></div>
      </div>

      <AnnouncementFormModal open={showCreate} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); refetch(); }} title="New Announcement" />
      <AnnouncementFormModal open={!!editItem} onClose={() => setEditItem(null)} existing={editItem} onSaved={() => { setEditItem(null); refetch(); }} title="Edit Announcement" />

      {/* Preview modal */}
      <Modal open={!!preview} onClose={() => setPreview(null)} title="Preview" size="md"
        footer={<Button variant="secondary" onClick={() => setPreview(null)}>Close</Button>}
      >
        {preview && (
          <div>
            {preview.image_url && <img src={preview.image_url} alt="" style={{ width:'100%', maxHeight:200, objectFit:'cover', borderRadius:8, marginBottom:16 }} />}
            <h2 style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>{preview.title}</h2>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:12 }}>{preview.author_name} · {timeAgo(preview.published_at)}</p>
            <div style={{ fontSize:14, lineHeight:1.7, color:'var(--text)', whiteSpace:'pre-wrap' }}>{preview.content}</div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!delItem} onClose={() => setDelItem(null)} onConfirm={handleDelete} loading={delLoading} danger
        title="Delete Announcement" message={`Delete "${delItem?.title}"?`} />
    </div>
  );
}

const BLANK_ANN = {
  title: '', content: '', is_pinned: false, is_published: false,
  expires_at: '', target_role: 'all', target_department: 'all',
};

function AnnouncementFormModal({ open, onClose, existing, onSaved, title }) {
  const [form,        setForm]        = useState(existing ? { ...BLANK_ANN, ...existing, target_role: existing.target_role || 'all', target_department: existing.target_department || 'all' } : BLANK_ANN);
  const [file,        setFile]        = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [errors,      setErrors]      = useState({});
  const [departments, setDepartments] = useState([]);

  React.useEffect(() => {
    if (existing) {
      setForm({ ...BLANK_ANN, ...existing, target_role: existing.target_role || 'all', target_department: existing.target_department || 'all' });
    }
  }, [existing]);

  React.useEffect(() => {
    if (!open) return;
    announcementAPI.getDepartments()
      .then(res => setDepartments(res?.data?.data?.departments || []))
      .catch(() => {});
  }, [open]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.title?.trim())   e.title   = 'Title required';
    if (!form.content?.trim()) e.content = 'Content required';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const payload = {
        title:             form.title,
        content:           form.content,
        is_pinned:         form.is_pinned    ? 'true' : 'false',
        is_published:      form.is_published ? 'true' : 'false',
        target_role:       form.target_role       || 'all',
        target_department: form.target_department || 'all',
        ...(form.expires_at && { expires_at: form.expires_at }),
      };
      if (existing?.id) {
        const res = await announcementAPI.update(existing.id, payload, file);
        const count = res?.data?.data?.notifications_sent || 0;
        toast.success('Announcement updated.');
        if (count > 0) toast.success(`${count} user${count !== 1 ? 's' : ''} notified.`);
      } else {
        const res = await announcementAPI.create(payload, file);
        const count = res?.data?.data?.notifications_sent || 0;
        toast.success('Announcement created.');
        if (count > 0) toast.success(`${count} user${count !== 1 ? 's' : ''} notified.`);
      }
      onSaved();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" loading={loading} onClick={handleSave}>Save</Button></>}
    >
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <Input label="Title" required value={form.title || ''} onChange={set('title')} error={errors.title} placeholder="Announcement title" />
        <div className="form-group">
          <label className="form-label form-label--req">Content</label>
          <textarea className={`form-input ${errors.content ? 'form-input--error' : ''}`} rows={6}
            value={form.content || ''} onChange={set('content')} placeholder="Write your announcement…"
            style={{ resize:'vertical' }} />
          {errors.content && <span className="form-error">{errors.content}</span>}
        </div>
        <div className="form-group">
          <label className="form-label">Image (optional)</label>
          <input type="file" accept="image/*" className="form-input" onChange={e => setFile(e.target.files[0])} style={{ padding:'6px' }} />
          {existing?.image_url && !file && <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>Current: <a href={existing.image_url} target="_blank" rel="noreferrer">View image</a></p>}
        </div>
        <Input label="Expiry date (optional)" type="datetime-local" value={form.expires_at || ''} onChange={set('expires_at')} />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Audience</label>
            <select className="form-input" value={form.target_role || 'all'} onChange={set('target_role')}>
              <option value="all">Everyone</option>
              <option value="students">Students Only</option>
              <option value="professors">Professors Only</option>
            </select>
          </div>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Department</label>
            <select className="form-input" value={form.target_department || 'all'} onChange={set('target_department')}>
              <option value="all">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
          <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
            <input type="checkbox" checked={!!form.is_pinned} onChange={e => setForm(f => ({ ...f, is_pinned: e.target.checked }))} />
            📌 Pin to top
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
            <input type="checkbox" checked={!!form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} />
            ✅ Publish immediately
          </label>
        </div>
      </div>
    </Modal>
  );
}
