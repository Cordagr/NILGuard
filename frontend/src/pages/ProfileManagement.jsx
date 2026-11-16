import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faFloppyDisk, faPen, faTrashCan, faUpload, faXmark } from '@fortawesome/free-solid-svg-icons';
import { Button } from '../components/ui/button';
import { useToast } from '../components/ui/toast';
import { updateUserProfile } from '../services/authApi';
import { useAuth } from '../context/AuthContext';
import '../styles/pages/ProfileManagement.css';
import logo from '../assets/NILGUARD.png';
import profileAvatar from '../assets/ProfileIcon.png';

const visibilityFields = [
  ['preferredName', 'Preferred name'],
  ['avatar', 'Photo or avatar'],
  ['sport', 'Sport'],
  ['year', 'Year'],
  ['contactEmail', 'Contact email']
];

function getInitialDraft(user) {
  return {
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    title: user?.title || '',
    phone: user?.phone || '',
    preferredName: user?.preferredName || '',
    avatar: isUploadedAvatarValue(user?.avatar) ? user.avatar : '',
    sport: user?.sport || '',
    year: user?.year || '',
    contactEmail: user?.contactEmail || '',
    profileVisibility: Object.fromEntries(
      visibilityFields.map(([field]) => [field, user?.profileVisibility?.[field] === true])
    ),
    educationSharingEnabled: user?.educationSharingEnabled === true
  };
}

function isUploadedAvatarValue(value) {
  return String(value || '').startsWith('data:image/');
}

function getAvatarImage(value) {
  return isUploadedAvatarValue(value) ? value : profileAvatar;
}

function validateDraft(draft, isAthlete) {
  const errors = {};
  const required = isAthlete
    ? ['firstName', 'lastName', 'sport', 'year']
    : ['firstName', 'lastName', 'title'];
  required.forEach((field) => {
    if (!draft[field].trim()) {
      errors[field] = 'Required';
    } else if (draft[field].trim().length > 100) {
      errors[field] = 'Must be 100 characters or fewer';
    }
  });
  if (draft.phone && !/^[0-9+().\-\s]{7,25}$/.test(draft.phone.trim())) {
    errors.phone = 'Enter a valid phone number';
  } else if (draft.phone.length > 25) {
    errors.phone = 'Must be 25 characters or fewer';
  }
  if (draft.contactEmail && (
    draft.contactEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contactEmail.trim())
  )) {
    errors.contactEmail = 'Enter a valid email address (254 characters max)';
  }
  if (draft.preferredName.length > 100) {
    errors.preferredName = 'Must be 100 characters or fewer';
  }
  return errors;
}

async function createCroppedAvatar(file) {
  if (!['image/png', 'image/jpeg'].includes(file.type)) {
    throw new Error('Choose a PNG or JPG image.');
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error('Profile photos must be 2 MB or smaller.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('This image could not be opened.'));
    });

    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Image processing is unavailable in this browser.');
    }
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256
    );
    return canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function ProfileManagement() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();
  const isAthlete = user?.role === 'student';
  const initialDraft = useMemo(() => getInitialDraft(user), [user]);
  const [draft, setDraft] = useState(initialDraft);
  const isUploadedAvatar = isUploadedAvatarValue(draft.avatar);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const avatarInputRef = useRef(null);
  const errors = validateDraft(draft, isAthlete);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const isValid = Object.keys(errors).length === 0;

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft]);

  useEffect(() => {
    if (!isEditing || !isDirty) {
      return undefined;
    }
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isEditing, isDirty]);

  const confirmDiscard = () => !isDirty || window.confirm('Discard your unsaved profile changes?');

  const handleCancel = () => {
    if (!confirmDiscard()) {
      return;
    }
    setDraft(initialDraft);
    setSaveError('');
    setAvatarError('');
    setIsEditing(false);
  };

  const handleFieldChange = (field, value) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setSaveError('');
  };

  const handleAvatarFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setAvatarError('');
    try {
      const avatar = await createCroppedAvatar(file);
      setDraft((previous) => ({ ...previous, avatar }));
    } catch (error) {
      setAvatarError(error.message || 'Unable to process this photo.');
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!isValid || !isDirty || isSaving) {
      return;
    }
    setSaveError('');
    setIsSaving(true);
    try {
      const profilePayload = isAthlete
        ? draft
        : {
            firstName: draft.firstName,
            lastName: draft.lastName,
            title: draft.title,
            phone: draft.phone,
            avatar: draft.avatar
          };
      const response = await updateUserProfile(profilePayload);
      updateUser(response.profile);
      setDraft(getInitialDraft(response.profile));
      setIsEditing(false);
      showToast({ variant: 'success', title: 'Profile updated' });
    } catch (error) {
      setSaveError(error.message || 'Unable to update your profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDashboardReturn = () => {
    if (confirmDiscard()) {
      navigate(isAthlete ? '/dashboard/student' : user?.role === 'school' ? '/dashboard/school' : '/dashboard/coach');
    }
  };

  const renderField = (field, label, options = {}) => (
    <label className="profile-field" key={field}>
      <span>{label}{options.required ? ' *' : ''}</span>
      <input
        type={options.type || 'text'}
        value={draft[field]}
        maxLength={options.maxLength || 100}
        required={options.required}
        aria-invalid={Boolean(errors[field])}
        aria-describedby={errors[field] ? `profile-error-${field}` : undefined}
        onChange={(event) => handleFieldChange(field, event.target.value)}
      />
      {errors[field] ? <small id={`profile-error-${field}`} className="profile-field-error">{errors[field]}</small> : null}
    </label>
  );

  return (
    <div className="profile-management-page">
      <header className="profile-management-header">
        <div className="profile-management-logo-wrap">
          <img src={logo} alt="NILGuard" className="profile-management-logo" />
        </div>
        <div className="profile-management-title">
          <h1>Account Profile</h1>
        </div>
        <Button type="button" variant="outline" onClick={handleDashboardReturn}>
          <FontAwesomeIcon icon={faArrowLeft} className="profile-action-icon" />
          Back to dashboard
        </Button>
      </header>

      <main className="profile-management-content">
        <section className={`profile-management-card${isEditing ? ' is-editing' : ''}`} aria-label="Account profile">
          <div className="profile-management-card-heading">
            <div className="profile-avatar">
              <img src={getAvatarImage(draft.avatar)} alt="" />
            </div>
            <div>
              <h2>{[draft.firstName, draft.lastName].filter(Boolean).join(' ') || 'Your profile'}</h2>
              <p>{isAthlete ? 'Athlete profile' : 'Coach profile'}</p>
            </div>
            {!isEditing ? (
              <Button type="button" variant="outline" onClick={() => setIsEditing(true)}>
                <FontAwesomeIcon icon={faPen} className="profile-action-icon" />
                Edit
              </Button>
            ) : null}
          </div>

          <form onSubmit={handleSave} noValidate>
            {isEditing ? (
              <div className="profile-fields-grid">
                {renderField('firstName', 'First name', { required: true })}
                {renderField('lastName', 'Last name', { required: true })}
                {isAthlete
                  ? renderField('preferredName', 'Preferred name')
                  : renderField('title', 'Title / role', { required: true })}
                {isAthlete
                  ? renderField('sport', 'Sport', { required: true })
                  : renderField('phone', 'Phone (optional)', { maxLength: 25, type: 'tel' })}
                {isAthlete ? renderField('year', 'Year', { required: true }) : null}
                {isAthlete ? renderField('contactEmail', 'Contact email (optional)', { maxLength: 254, type: 'email' }) : null}
              </div>
            ) : null}

            <div className="profile-readonly-grid">
              <div><span>Email</span><strong>{user?.email || 'Not available'}</strong></div>
              <div><span>School</span><strong>{user?.school || 'Not assigned'}</strong></div>
              {isAthlete ? <div><span>Student ID</span><strong>{user?.studentId || 'Not linked'}</strong></div> : null}
            </div>

            {isEditing ? (
              <>
                <div className="profile-avatar-editor">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="profile-avatar-input"
                    onChange={handleAvatarFile}
                  />
                  <div className="profile-avatar-actions">
                    <Button type="button" variant="outline" onClick={() => avatarInputRef.current?.click()}>
                      <FontAwesomeIcon icon={faUpload} className="profile-action-icon" />
                      Upload photo
                    </Button>
                    {isUploadedAvatar ? (
                      <Button type="button" variant="ghost" onClick={() => handleFieldChange('avatar', '')}>
                        <FontAwesomeIcon icon={faTrashCan} className="profile-action-icon" />
                        Remove photo
                      </Button>
                    ) : null}
                  </div>
                  <small className="profile-avatar-hint">PNG or JPG, up to 2 MB. Photos are checked and resized to a square.</small>
                  {avatarError ? <small className="profile-field-error">{avatarError}</small> : null}
                </div>

                {isAthlete ? (
                  <fieldset className="profile-privacy-settings">
                    <legend>Privacy</legend>
                    <p>Only coaches at your school can see fields you choose to share. Your name is always visible on your roster.</p>
                    {visibilityFields.map(([field, label]) => (
                      <label key={field}>
                        <input
                          type="checkbox"
                          checked={draft.profileVisibility[field]}
                          onChange={(event) => setDraft((previous) => ({
                            ...previous,
                            profileVisibility: {
                              ...previous.profileVisibility,
                              [field]: event.target.checked
                            }
                          }))}
                        />
                        <span>Share {label.toLowerCase()} with my school’s coaches</span>
                      </label>
                    ))}
                    <label>
                      <input
                        type="checkbox"
                        checked={draft.educationSharingEnabled}
                        onChange={(event) => setDraft((previous) => ({
                          ...previous,
                          educationSharingEnabled: event.target.checked
                        }))}
                      />
                      <span>Share my education progress with my school’s coaches</span>
                    </label>
                  </fieldset>
                ) : null}

                {saveError ? <p className="profile-form-error" role="alert">{saveError}</p> : null}
                <div className="profile-edit-actions">
                  <Button type="submit" variant="default" disabled={!isValid || !isDirty || isSaving}>
                    <FontAwesomeIcon icon={faFloppyDisk} className="profile-action-icon" />
                    {isSaving ? 'Saving...' : 'Save'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={handleCancel} disabled={isSaving}>
                    <FontAwesomeIcon icon={faXmark} className="profile-action-icon" />
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                {isAthlete && draft.preferredName ? <p className="profile-view-field"><span>Preferred name</span>{draft.preferredName}</p> : null}
                {isAthlete ? (
                  <>
                    <p className="profile-view-field"><span>Sport</span>{draft.sport || 'Not provided'}</p>
                    <p className="profile-view-field"><span>Year</span>{draft.year || 'Not provided'}</p>
                    {draft.contactEmail ? <p className="profile-view-field"><span>Contact email</span>{draft.contactEmail}</p> : null}
                  </>
                ) : (
                  <>
                    <p className="profile-view-field"><span>Title / role</span>{draft.title || 'Not provided'}</p>
                    {draft.phone ? <p className="profile-view-field"><span>Phone</span>{draft.phone}</p> : null}
                  </>
                )}
              </>
            )}
          </form>
        </section>
      </main>
    </div>
  );
}

export default ProfileManagement;
