import * as React from 'react';
import { Check, FileText, GripVertical, PencilLine, Plus, Trash2 } from 'lucide-react';
import { collectRuleFields, stageRulesSchema, statusModelSchema, visibilityRuleSchema } from '@se/shared';
import type {
  CreateFormDraftRequest,
  FieldType,
  FormBuilderListItemDto,
  FormDefinitionDto,
  FormField,
  FormFieldDto,
  SaveDraftRoutingRequest,
  StageRules,
  StatusModel,
} from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { FieldModal, type FieldModalSaveInput, fieldTypeLabel } from '@/components/form-engine/FieldModal';
import { RoutingEditor } from '@/components/form-engine/RoutingEditor';
import { StatusModelEditor } from '@/components/form-engine/StatusModelEditor';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const FORM_STATUS_STYLE: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  published: { label: 'Published', bg: 'rgb(233,246,233)', fg: 'rgb(33,131,88)', dot: 'rgb(70,167,88)' },
  draft: { label: 'Draft', bg: 'rgb(255,247,237)', fg: 'rgb(204,78,0)', dot: 'rgb(247,107,21)' },
  archived: { label: 'Archived', bg: 'rgb(241,242,242)', fg: 'var(--ink-500)', dot: 'var(--ink-400)' },
};

function FormStatusBadge({ status }: { status: string }) {
  const c = FORM_STATUS_STYLE[status] ?? FORM_STATUS_STYLE.draft;
  return (
    <span
      className="inline-flex flex-none items-center gap-[6px] rounded-full px-[10px] py-1 text-xs font-medium"
      style={{ background: c.bg, color: c.fg }}
    >
      <span className="h-[6px] w-[6px] flex-none rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}

/** Clickable Required/Optional pill — toggles in place, no modal (mirrors the design's `toggleFormFieldReq`). */
function RequiredBadge({
  required,
  disabled,
  onToggle,
}: {
  required: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`flex-none rounded-full px-[10px] py-1 text-xs font-medium transition-colors disabled:cursor-default disabled:opacity-60 ${
        required ? 'bg-brand/10 text-brand' : 'bg-surface-muted text-ink-400'
      }`}
    >
      {required ? 'Required' : 'Optional'}
    </button>
  );
}

function formattedDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Labels of other fields whose visibility rule references `key` — deleting `key` would leave
 * those rules with a dangling reference, so the caller should block the delete until they're gone. */
function fieldsReferencing(fields: FormFieldDto[], key: string): string[] {
  return fields
    .filter((f) => f.key !== key)
    .filter((f) => {
      const parsed = visibilityRuleSchema.safeParse(f.visibilityRule);
      return parsed.success && collectRuleFields(parsed.data.when).includes(key);
    })
    .map((f) => f.label);
}

/** Whether `key` is named as an approver-stage field in the draft's routing config — deleting it
 * would leave that stage with a dangling reference, so the caller should block the delete until
 * the stage is removed (Routing tab). */
function fieldUsedAsStage(stageRules: StageRules | null, key: string): boolean {
  return (
    stageRules?.approvers.some(
      (rule) => rule.field === key || (rule.when && collectRuleFields(rule.when.when).includes(key)),
    ) ?? false
  );
}

/**
 * Two-pane admin Form Builder (PRD §6/§16, form-builder Slice 1-3): a form list (name, field
 * count, last updated, Draft/Published badge) and a field editor (drag-reorder, Required
 * toggle, edit/delete, Add/Edit Field modal) — every mutation saves immediately as a Draft
 * via `PUT /forms/drafts/:key`. Publish flips the draft to an immutable published version
 * (`POST /forms/drafts/:key/publish`); editing a published form (core or custom) starts a new
 * draft (`POST /forms/drafts/:key/start`). Core-form drafts are locked to metadata-bounds edits —
 * Add Field, Delete Field, and the field-type select are disabled with an explanatory tooltip.
 */
export default function FormBuilder() {
  const { user } = useAuth();
  const [forms, setForms] = React.useState<FormBuilderListItemDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<FormDefinitionDto | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [publishing, setPublishing] = React.useState(false);
  const [startingDraft, setStartingDraft] = React.useState(false);
  const [fieldModal, setFieldModal] = React.useState<{ mode: 'add' | 'edit'; field: FormFieldDto | null } | null>(
    null,
  );
  const [creating, setCreating] = React.useState(false);
  const [createTitle, setCreateTitle] = React.useState('');
  const [createBusy, setCreateBusy] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [activeTab, setActiveTab] = React.useState<'fields' | 'routing' | 'statusModel'>('fields');
  const [routingSaving, setRoutingSaving] = React.useState(false);
  const [routingError, setRoutingError] = React.useState<string | null>(null);
  const [statusModelSaving, setStatusModelSaving] = React.useState(false);
  const [statusModelError, setStatusModelError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await apiFetch<FormBuilderListItemDto[]>('/forms/drafts');
      setForms(rows);
      setSelectedKey((current) => current ?? rows[0]?.key ?? null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Unable to load forms.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const selectedItem = forms.find((f) => f.key === selectedKey) ?? null;
  const selectedStatus = selectedItem?.status;
  const isEditable = selectedStatus === 'draft';
  const isCoreForm = selectedItem?.renderer === 'core';
  /** Core-form drafts are locked to metadata-bounds edits (relabel/reorder/validation/routing) —
   * adding or deleting a field, or changing a field's type, is a structural edit the server refuses. */
  const coreLockTitle = 'Core form fields are structural — relabel, reorder, or edit validation instead.';

  React.useEffect(() => {
    if (!selectedKey || !selectedStatus) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    const path = selectedStatus === 'draft' ? `/forms/drafts/${selectedKey}` : `/forms/${selectedKey}`;
    apiFetch<FormDefinitionDto>(path)
      .then(setDetail)
      .catch((err) => setDetailError(err instanceof ApiError ? err.message : 'Unable to load the form.'))
      .finally(() => setDetailLoading(false));
  }, [selectedKey, selectedStatus]);

  const fields = React.useMemo(() => detail?.sections.flatMap((s) => s.fields) ?? [], [detail]);
  const stageRules = React.useMemo<StageRules | null>(() => {
    const raw = detail?.approvalWorkflow?.stageRules;
    if (!raw) return null;
    const parsed = stageRulesSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }, [detail]);
  const statusModel = React.useMemo<StatusModel | null>(() => {
    const raw = detail?.statusModel;
    if (!raw) return null;
    const parsed = statusModelSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }, [detail]);

  // Switching forms leaves any stale routing/status-model UI state (tab selection, save error) behind.
  React.useEffect(() => {
    setActiveTab('fields');
    setRoutingError(null);
    setStatusModelError(null);
  }, [selectedKey]);

  async function persist(nextFields: FormFieldDto[]): Promise<boolean> {
    if (!selectedKey) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        fields: nextFields.map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type as FieldType,
          required: f.required,
          options: (f.options ?? undefined) as FormField['options'],
          validation: (f.validation ?? undefined) as FormField['validation'],
          visibilityRule: (f.visibilityRule ?? undefined) as FormField['visibilityRule'],
        })),
      };
      const updated = await apiFetch<FormDefinitionDto>(`/forms/drafts/${selectedKey}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setDetail(updated);
      const nowIso = new Date().toISOString();
      setForms((prev) =>
        prev.map((f) => (f.key === selectedKey ? { ...f, fieldCount: nextFields.length, updatedAt: nowIso } : f)),
      );
      return true;
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Unable to save changes.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  function onToggleRequired(field: FormFieldDto) {
    persist(fields.map((f) => (f.key === field.key ? { ...f, required: !f.required } : f)));
  }

  function onDeleteField(field: FormFieldDto) {
    const referencedBy = fieldsReferencing(fields, field.key);
    if (referencedBy.length > 0) {
      setSaveError(
        `Can't delete "${field.label}" — remove the visibility condition on ${referencedBy.join(', ')} first.`,
      );
      return;
    }
    if (fieldUsedAsStage(stageRules, field.key)) {
      setSaveError(`Can't delete "${field.label}" — it's used as an approver stage in Routing. Remove that stage first.`);
      return;
    }
    persist(fields.filter((f) => f.key !== field.key));
  }

  async function persistRouting(nextStageRules: StageRules): Promise<void> {
    if (!selectedKey) return;
    setRoutingSaving(true);
    setRoutingError(null);
    try {
      const body: SaveDraftRoutingRequest = { mode: 'parallel', stageRules: nextStageRules };
      const updated = await apiFetch<FormDefinitionDto>(`/forms/drafts/${selectedKey}/routing`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setDetail(updated);
    } catch (err) {
      setRoutingError(err instanceof ApiError ? err.message : 'Unable to save routing.');
    } finally {
      setRoutingSaving(false);
    }
  }

  async function persistStatusModel(nextStatusModel: StatusModel): Promise<void> {
    if (!selectedKey) return;
    setStatusModelSaving(true);
    setStatusModelError(null);
    try {
      const updated = await apiFetch<FormDefinitionDto>(`/forms/drafts/${selectedKey}/status-model`, {
        method: 'PUT',
        body: JSON.stringify(nextStatusModel),
      });
      setDetail(updated);
    } catch (err) {
      setStatusModelError(err instanceof ApiError ? err.message : 'Unable to save the status model.');
    } finally {
      setStatusModelSaving(false);
    }
  }

  function onDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const next = [...fields];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    setDragIndex(null);
    persist(next);
  }

  async function onSaveField(input: FieldModalSaveInput) {
    const exists = fields.some((f) => f.key === input.key);
    const next: FormFieldDto[] = exists
      ? fields.map((f) => (f.key === input.key ? { ...f, ...input } : f))
      : [
          ...fields,
          { ...input, options: input.options ?? null, validation: null, visibilityRule: input.visibilityRule ?? null },
        ];
    const ok = await persist(next);
    if (ok) setFieldModal(null);
  }

  async function onPublish() {
    if (!selectedKey) return;
    setPublishing(true);
    setSaveError(null);
    try {
      await apiFetch<FormDefinitionDto>(`/forms/drafts/${selectedKey}/publish`, { method: 'POST' });
      await load();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Unable to publish this form.');
    } finally {
      setPublishing(false);
    }
  }

  async function onStartDraft() {
    if (!selectedKey) return;
    setStartingDraft(true);
    setSaveError(null);
    try {
      await apiFetch<FormDefinitionDto>(`/forms/drafts/${selectedKey}/start`, { method: 'POST' });
      await load();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Unable to start a new draft.');
    } finally {
      setStartingDraft(false);
    }
  }

  async function onCreateForm() {
    setCreateError(null);
    if (!createTitle.trim()) {
      setCreateError('Title is required.');
      return;
    }
    setCreateBusy(true);
    try {
      const body: CreateFormDraftRequest = { title: createTitle };
      const dto = await apiFetch<FormDefinitionDto>('/forms/drafts', { method: 'POST', body: JSON.stringify(body) });
      setCreating(false);
      setCreateTitle('');
      await load();
      setSelectedKey(dto.key);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Unable to create the form.');
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Form Builder"
        subtitle="Create and edit request forms without engineering — add fields, set requirements, and publish when ready."
        breadcrumb={`Configuration · ${user?.tenantName ?? ''}`}
      />

      <div className="mt-[22px] grid grid-cols-[1.1fr_1.5fr] gap-5">
        {/* Left pane — forms list */}
        <div className="overflow-hidden rounded-xl border border-line-soft bg-surface shadow-card">
          <div className="flex items-center gap-3 border-b border-line-soft px-5 py-4">
            <span className="text-[15px] font-bold text-ink-900">Forms</span>
            <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
              <Plus size={15} />
              New Form
            </Button>
          </div>
          {loading ? (
            <div className="px-5 py-12 text-center text-sm text-ink-400">Loading…</div>
          ) : loadError ? (
            <div className="px-5 py-12 text-center text-sm text-danger">{loadError}</div>
          ) : forms.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-ink-400">
              No forms yet. Create one to get started.
            </div>
          ) : (
            forms.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setSelectedKey(f.key)}
                className={`flex w-full items-center gap-3 border-b border-line-soft px-5 py-[14px] text-left last:border-b-0 ${
                  f.key === selectedKey ? 'bg-[rgb(236,245,246)]' : 'bg-surface hover:bg-surface-muted'
                }`}
              >
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-[rgb(236,245,246)] text-brand">
                  <FileText size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink-900">{f.title}</div>
                  <div className="truncate text-xs text-ink-400">
                    {f.fieldCount} field{f.fieldCount === 1 ? '' : 's'} · updated {formattedDate(f.updatedAt)}
                  </div>
                </div>
                <FormStatusBadge status={f.status} />
              </button>
            ))
          )}
        </div>

        {/* Right pane — field editor for the selected form */}
        <div className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-line-soft bg-surface shadow-card">
          {!selectedItem ? (
            <div className="flex flex-1 items-center justify-center px-5 py-12 text-center text-sm text-ink-400">
              Select a form to edit its fields.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-line-soft px-5 py-4">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-bold text-ink-900">{selectedItem.title}</div>
                  <div className="text-xs text-ink-400">
                    {fields.length} field{fields.length === 1 ? '' : 's'} ·{' '}
                    {FORM_STATUS_STYLE[selectedItem.status]?.label ?? selectedItem.status}
                  </div>
                </div>
                {activeTab === 'fields' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="ml-auto"
                    disabled={!isEditable || isCoreForm}
                    title={isCoreForm ? coreLockTitle : undefined}
                    onClick={() => setFieldModal({ mode: 'add', field: null })}
                  >
                    <Plus size={15} />
                    Add Field
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2 border-b border-line-soft px-5 py-3">
                {(['fields', 'routing', 'statusModel'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-lg border px-[13px] py-[7px] text-[12.5px] font-semibold transition-colors ${
                      activeTab === tab
                        ? 'border-brand bg-brand text-white'
                        : 'border-line-soft bg-surface text-ink-500 hover:bg-surface-muted'
                    }`}
                  >
                    {tab === 'fields' ? 'Fields' : tab === 'routing' ? 'Routing' : 'Status Model'}
                  </button>
                ))}
              </div>

              {!isEditable && (
                <div className="flex items-center justify-between gap-3 border-b border-line-soft bg-app-bg px-5 py-3 text-[12.5px] text-ink-400">
                  <span>This form is published. Start a new draft to make changes.</span>
                  <Button size="sm" variant="secondary" disabled={startingDraft} onClick={onStartDraft}>
                    <PencilLine size={14} />
                    {startingDraft ? 'Starting…' : 'Edit'}
                  </Button>
                </div>
              )}
              {isEditable && isCoreForm && (
                <div className="border-b border-line-soft bg-app-bg px-5 py-3 text-[12.5px] text-ink-400">
                  Core form fields can be relabeled, reordered, and have their validation or routing edited — adding,
                  removing, or retyping a field isn't supported here.
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {detailLoading ? (
                  <div className="py-12 text-center text-sm text-ink-400">Loading…</div>
                ) : detailError ? (
                  <div className="py-12 text-center text-sm text-danger">{detailError}</div>
                ) : activeTab === 'routing' ? (
                  <RoutingEditor
                    key={selectedKey}
                    fields={fields}
                    stageRules={stageRules}
                    disabled={!isEditable}
                    saving={routingSaving}
                    error={routingError}
                    onSave={persistRouting}
                  />
                ) : activeTab === 'statusModel' ? (
                  <StatusModelEditor
                    key={selectedKey}
                    statusModel={statusModel}
                    disabled={!isEditable}
                    saving={statusModelSaving}
                    error={statusModelError}
                    onSave={persistStatusModel}
                  />
                ) : fields.length === 0 ? (
                  <div className="rounded-[10px] border border-dashed border-line bg-app-bg px-3 py-8 text-center text-[13px] text-ink-400">
                    No fields yet. Add your first field to get started.
                  </div>
                ) : (
                  <div className="flex flex-col gap-[10px]">
                    {fields.map((field, index) => {
                      const referencedBy = fieldsReferencing(fields, field.key);
                      return (
                        <div
                          key={field.key}
                          draggable={isEditable}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', String(index));
                            setDragIndex(index);
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => onDrop(index)}
                          className="flex items-center gap-3 rounded-[10px] border border-line-soft bg-app-bg px-[14px] py-3"
                        >
                          <GripVertical
                            size={16}
                            className={`flex-none text-ink-300 ${isEditable ? 'cursor-grab' : 'opacity-50'}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-ink-900">{field.label}</div>
                            <div className="truncate text-xs text-ink-400">{fieldTypeLabel(field.type)}</div>
                          </div>
                          <RequiredBadge
                            required={field.required}
                            disabled={!isEditable || saving}
                            onToggle={() => onToggleRequired(field)}
                          />
                          <button
                            type="button"
                            className="flex-none rounded-[6px] p-1 text-ink-400 hover:bg-surface-muted disabled:cursor-default disabled:opacity-40"
                            disabled={!isEditable}
                            onClick={() => setFieldModal({ mode: 'edit', field })}
                            aria-label={`Edit ${field.label}`}
                          >
                            <PencilLine size={16} />
                          </button>
                          <button
                            type="button"
                            className="flex-none rounded-[6px] p-1 text-ink-400 hover:bg-danger/10 hover:text-danger disabled:cursor-default disabled:opacity-40"
                            disabled={
                              !isEditable || isCoreForm || referencedBy.length > 0 || fieldUsedAsStage(stageRules, field.key)
                            }
                            onClick={() => onDeleteField(field)}
                            aria-label={`Delete ${field.label}`}
                            title={
                              isCoreForm
                                ? coreLockTitle
                                : referencedBy.length > 0
                                  ? `Referenced by ${referencedBy.join(', ')}'s visibility condition — remove that condition first`
                                  : fieldUsedAsStage(stageRules, field.key)
                                    ? 'Used as an approver stage in Routing — remove that stage first'
                                    : undefined
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {saveError && <div className="mt-3 text-sm font-medium text-danger">{saveError}</div>}
              </div>

              <div className="flex justify-end gap-3 border-t border-line-soft px-5 py-4">
                <Button
                  variant="secondary"
                  disabled={!isEditable || saving || publishing}
                  onClick={() => persist(fields)}
                >
                  {saving ? 'Saving…' : 'Save Draft'}
                </Button>
                <Button
                  disabled={!isEditable || saving || publishing || fields.length === 0}
                  onClick={onPublish}
                  title={fields.length === 0 ? 'Add at least one field before publishing' : undefined}
                >
                  <Check size={16} />
                  {publishing ? 'Publishing…' : 'Publish'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {fieldModal && (
        <FieldModal
          mode={fieldModal.mode}
          initial={fieldModal.field}
          existingKeys={fields.map((f) => f.key)}
          otherFields={fields
            .filter((f) => f.key !== fieldModal.field?.key)
            .map((f) => ({ key: f.key, label: f.label, type: f.type as FieldType }))}
          usedAsStage={fieldModal.field !== null && fieldUsedAsStage(stageRules, fieldModal.field.key)}
          isCoreForm={isCoreForm}
          busy={saving}
          error={saveError}
          onClose={() => setFieldModal(null)}
          onSave={onSaveField}
        />
      )}

      {creating && (
        <Overlay onClose={() => setCreating(false)} z={60}>
          <div className="mx-auto w-full max-w-[440px] rounded-2xl bg-surface p-[26px] shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-[rgb(236,245,246)] text-brand">
                <FileText size={20} />
              </div>
              <div className="text-lg font-bold text-ink-900">New form</div>
            </div>
            <div className="mt-5">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-ink-900">Form title</span>
                <div className="flex h-11 items-center rounded-sm border border-line bg-surface px-3">
                  <input
                    type="text"
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder="e.g. IT Asset Request"
                    className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
                  />
                </div>
              </label>
            </div>
            {createError && <div className="mt-4 text-sm font-medium text-danger">{createError}</div>}
            <div className="mt-[22px] flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setCreating(false)} disabled={createBusy}>
                Cancel
              </Button>
              <Button onClick={onCreateForm} disabled={createBusy}>
                <Plus size={16} />
                {createBusy ? 'Creating…' : 'Create form'}
              </Button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}
