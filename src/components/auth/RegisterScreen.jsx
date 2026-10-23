// RegisterScreen.jsx - Multi-step student onboarding form matching backend schema.
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function RegisterScreen() {
  const { register, loading, error, setError, logout } = useAuth();
  const [step, setStep] = useState(1);

  // Form State
  const [formData, setFormData] = useState({
    fullName: '',
    dob: '',
    gender: 'prefer_not_to_say',
    mobile: '',
    college: '',
    studentId: '',
    addressLine: '',
    city: '',
    state: '',
    pincode: '',
    nomineeName: '',
    nomineeRelation: 'Parent',
    kycLast4: '',
    pin: '',
    confirmPin: '',
    consent: false,
  });

  const [fieldErrors, setFieldErrors] = useState({});

  function updateField(key, value) {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => ({ ...prev, [key]: null }));
    }
    if (error) setError(null);
  }

  // Calculate age given YYYY-MM-DD
  function calculateAge(dobStr) {
    if (!dobStr) return 0;
    const dob = new Date(dobStr);
    const diffMs = Date.now() - dob.getTime();
    const ageDt = new Date(diffMs);
    return Math.abs(ageDt.getUTCFullYear() - 1970);
  }

  // Step 1 Validation
  function validateStep1() {
    const errors = {};
    if (!formData.fullName.trim() || formData.fullName.trim().length < 2) {
      errors.fullName = 'Full name must be at least 2 characters';
    } else if (formData.fullName.trim().length > 80) {
      errors.fullName = 'Full name must not exceed 80 characters';
    }

    if (!formData.dob) {
      errors.dob = 'Date of birth is required';
    } else {
      const age = calculateAge(formData.dob);
      if (age < 16 || age > 100) {
        errors.dob = 'Must be between 16 and 100 years old to register';
      }
    }

    if (!formData.mobile || !/^[6-9][0-9]{9}$/.test(formData.mobile.trim())) {
      errors.mobile = 'Enter a valid 10-digit Indian mobile number (starts with 6-9)';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // Step 2 Validation
  function validateStep2() {
    const errors = {};
    if (!formData.college.trim() || formData.college.trim().length < 2) {
      errors.college = 'College/University name is required';
    }
    if (!formData.studentId.trim() || formData.studentId.trim().length < 2) {
      errors.studentId = 'Student ID / Roll No is required';
    }
    if (!formData.addressLine.trim() || formData.addressLine.trim().length < 3) {
      errors.addressLine = 'Street address line must be at least 3 characters';
    }
    if (!formData.city.trim() || formData.city.trim().length < 2) {
      errors.city = 'City is required';
    }
    if (!formData.state.trim() || formData.state.trim().length < 2) {
      errors.state = 'State is required';
    }
    if (!formData.pincode || !/^[0-9]{6}$/.test(formData.pincode.trim())) {
      errors.pincode = 'Pincode must be exactly 6 digits';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // Step 3 Validation
  function validateStep3() {
    const errors = {};
    if (!formData.nomineeName.trim() || formData.nomineeName.trim().length < 2) {
      errors.nomineeName = 'Nominee name is required (min 2 chars)';
    }
    if (!formData.nomineeRelation.trim() || formData.nomineeRelation.trim().length < 2) {
      errors.nomineeRelation = 'Nominee relation is required';
    }
    if (formData.kycLast4 && !/^[0-9]{4}$/.test(formData.kycLast4.trim())) {
      errors.kycLast4 = 'KYC last 4 digits must be exactly 4 numbers if provided';
    }
    if (!formData.pin || !/^\d{4}$/.test(formData.pin)) {
      errors.pin = 'PIN must be exactly 4 digits';
    }
    if (formData.pin !== formData.confirmPin) {
      errors.confirmPin = 'PINs do not match';
    }
    if (!formData.consent) {
      errors.consent = 'You must accept the terms and student banking consent';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleCompleteRegistration(e) {
    e.preventDefault();
    if (!validateStep3()) return;

    const payload = {
      fullName: formData.fullName.trim(),
      dob: formData.dob,
      gender: formData.gender,
      mobile: formData.mobile.trim(),
      address: {
        line: formData.addressLine.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        pincode: formData.pincode.trim(),
      },
      college: formData.college.trim(),
      studentId: formData.studentId.trim(),
      nominee: {
        name: formData.nomineeName.trim(),
        relation: formData.nomineeRelation.trim(),
      },
      kycLast4: formData.kycLast4 ? formData.kycLast4.trim() : undefined,
      pin: formData.pin,
      consent: true,
    };

    try {
      await register(payload);
    } catch (err) {
      // Backend error displayed via context error
    }
  }

  return (
    <div className="flex flex-1 flex-col justify-between py-4">
      {/* Header with Step Indicator */}
      <div>
        <div className="flex items-center justify-between pb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Step {step} of 3
          </span>
          <button
            type="button"
            onClick={logout}
            className="text-xs text-muted hover:text-ink font-medium"
          >
            Cancel
          </button>
        </div>

        {/* Segmented Progress Bar */}
        <div className="flex h-1.5 w-full gap-1.5 overflow-hidden rounded-full bg-line">
          <div className={`h-full flex-1 rounded-full bg-brand transition-all duration-300 ${step >= 1 ? 'opacity-100' : 'opacity-20'}`} />
          <div className={`h-full flex-1 rounded-full bg-brand transition-all duration-300 ${step >= 2 ? 'opacity-100' : 'opacity-20'}`} />
          <div className={`h-full flex-1 rounded-full bg-brand transition-all duration-300 ${step >= 3 ? 'opacity-100' : 'opacity-20'}`} />
        </div>

        <h1 className="mt-4 text-xl font-bold tracking-tight text-ink">
          {step === 1 && 'Personal Information'}
          {step === 2 && 'Campus & Address'}
          {step === 3 && 'Security & Nominee'}
        </h1>
        <p className="text-xs text-muted">
          {step === 1 && 'Let’s set up your verified student identity.'}
          {step === 2 && 'Used to activate your student zero-fee banking account.'}
          {step === 3 && 'Set your 4-digit PIN for instant access and transfers.'}
        </p>
      </div>

      {/* Form Content Area */}
      <div className="my-3 flex-1 overflow-y-auto rounded-3xl border border-line bg-card p-5 shadow-sm">
        {error && (
          <div className="mb-4 rounded-xl bg-err/10 px-3 py-2 text-xs font-medium text-err">
            {error}
          </div>
        )}

        {/* STEP 1: Personal Details */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Full Name (as per ID) *</label>
              <input
                type="text"
                placeholder="Linus Torvalds"
                value={formData.fullName}
                onChange={(e) => updateField('fullName', e.target.value)}
                className="w-full rounded-2xl border border-line bg-bg/50 px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none"
              />
              {fieldErrors.fullName && <p className="mt-1 text-[11px] text-err">{fieldErrors.fullName}</p>}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Date of Birth *</label>
              <input
                type="date"
                value={formData.dob}
                onChange={(e) => updateField('dob', e.target.value)}
                className="w-full rounded-2xl border border-line bg-bg/50 px-3.5 py-2.5 text-sm text-ink focus:border-brand focus:outline-none"
              />
              {fieldErrors.dob && <p className="mt-1 text-[11px] text-err">{fieldErrors.dob}</p>}
              <p className="mt-1 text-[11px] text-muted">Students must be 16-100 years of age</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Gender</label>
              <select
                value={formData.gender}
                onChange={(e) => updateField('gender', e.target.value)}
                className="w-full rounded-2xl border border-line bg-bg/50 px-3.5 py-2.5 text-sm text-ink focus:border-brand focus:outline-none"
              >
                <option value="prefer_not_to_say">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Mobile Number *</label>
              <div className="flex">
                <span className="flex items-center rounded-l-2xl border border-r-0 border-line bg-bg/70 px-3 text-xs font-semibold text-muted">
                  +91
                </span>
                <input
                  type="tel"
                  maxLength={10}
                  placeholder="9876543210"
                  value={formData.mobile}
                  onChange={(e) => updateField('mobile', e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-r-2xl border border-line bg-bg/50 px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none"
                />
              </div>
              {fieldErrors.mobile && <p className="mt-1 text-[11px] text-err">{fieldErrors.mobile}</p>}
            </div>
          </div>
        )}

        {/* STEP 2: College & Address */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">College / University Name *</label>
              <input
                type="text"
                placeholder="National Institute of Technology"
                value={formData.college}
                onChange={(e) => updateField('college', e.target.value)}
                className="w-full rounded-2xl border border-line bg-bg/50 px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none"
              />
              {fieldErrors.college && <p className="mt-1 text-[11px] text-err">{fieldErrors.college}</p>}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Student ID / Roll Number *</label>
              <input
                type="text"
                placeholder="21BCSE042"
                value={formData.studentId}
                onChange={(e) => updateField('studentId', e.target.value)}
                className="w-full rounded-2xl border border-line bg-bg/50 px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none"
              />
              {fieldErrors.studentId && <p className="mt-1 text-[11px] text-err">{fieldErrors.studentId}</p>}
            </div>

            <div className="border-t border-line/60 pt-3">
              <label className="mb-1 block text-xs font-semibold text-ink">Address Line *</label>
              <input
                type="text"
                placeholder="Flat 302, Green Valley Apts, Campus Road"
                value={formData.addressLine}
                onChange={(e) => updateField('addressLine', e.target.value)}
                className="w-full rounded-2xl border border-line bg-bg/50 px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none"
              />
              {fieldErrors.addressLine && <p className="mt-1 text-[11px] text-err">{fieldErrors.addressLine}</p>}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">City *</label>
                <input
                  type="text"
                  placeholder="Bengaluru"
                  value={formData.city}
                  onChange={(e) => updateField('city', e.target.value)}
                  className="w-full rounded-2xl border border-line bg-bg/50 px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none"
                />
                {fieldErrors.city && <p className="mt-1 text-[11px] text-err">{fieldErrors.city}</p>}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">State *</label>
                <input
                  type="text"
                  placeholder="Karnataka"
                  value={formData.state}
                  onChange={(e) => updateField('state', e.target.value)}
                  className="w-full rounded-2xl border border-line bg-bg/50 px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none"
                />
                {fieldErrors.state && <p className="mt-1 text-[11px] text-err">{fieldErrors.state}</p>}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">6-Digit Pincode *</label>
              <input
                type="text"
                maxLength={6}
                placeholder="560001"
                value={formData.pincode}
                onChange={(e) => updateField('pincode', e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-2xl border border-line bg-bg/50 px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none"
              />
              {fieldErrors.pincode && <p className="mt-1 text-[11px] text-err">{fieldErrors.pincode}</p>}
            </div>
          </div>
        )}

        {/* STEP 3: Nominee, KYC, PIN, and Consent */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Nominee Name *</label>
                <input
                  type="text"
                  placeholder="Parent / Guardian"
                  value={formData.nomineeName}
                  onChange={(e) => updateField('nomineeName', e.target.value)}
                  className="w-full rounded-2xl border border-line bg-bg/50 px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none"
                />
                {fieldErrors.nomineeName && <p className="mt-1 text-[11px] text-err">{fieldErrors.nomineeName}</p>}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Relationship *</label>
                <input
                  type="text"
                  placeholder="e.g. Mother, Father"
                  value={formData.nomineeRelation}
                  onChange={(e) => updateField('nomineeRelation', e.target.value)}
                  className="w-full rounded-2xl border border-line bg-bg/50 px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none"
                />
                {fieldErrors.nomineeRelation && <p className="mt-1 text-[11px] text-err">{fieldErrors.nomineeRelation}</p>}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">
                Aadhaar / KYC Last 4 Digits <span className="text-muted font-normal">(Optional)</span>
              </label>
              <input
                type="password"
                maxLength={4}
                placeholder="••••"
                value={formData.kycLast4}
                onChange={(e) => updateField('kycLast4', e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-2xl border border-line bg-bg/50 px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none"
              />
              {fieldErrors.kycLast4 && <p className="mt-1 text-[11px] text-err">{fieldErrors.kycLast4}</p>}
            </div>

            <div className="border-t border-line/60 pt-3">
              <label className="mb-1 block text-xs font-semibold text-ink">Set 4-Digit Security PIN *</label>
              <input
                type="password"
                maxLength={4}
                inputMode="numeric"
                placeholder="4-digit PIN"
                value={formData.pin}
                onChange={(e) => updateField('pin', e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-2xl border border-line bg-bg/50 px-3.5 py-2.5 text-center text-lg font-bold tracking-widest text-ink focus:border-brand focus:outline-none"
              />
              {fieldErrors.pin && <p className="mt-1 text-[11px] text-err">{fieldErrors.pin}</p>}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Confirm 4-Digit PIN *</label>
              <input
                type="password"
                maxLength={4}
                inputMode="numeric"
                placeholder="Re-enter PIN"
                value={formData.confirmPin}
                onChange={(e) => updateField('confirmPin', e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-2xl border border-line bg-bg/50 px-3.5 py-2.5 text-center text-lg font-bold tracking-widest text-ink focus:border-brand focus:outline-none"
              />
              {fieldErrors.confirmPin && <p className="mt-1 text-[11px] text-err">{fieldErrors.confirmPin}</p>}
            </div>

            <div className="border-t border-line/60 pt-3">
              <label className="flex items-start gap-2.5 text-xs text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.consent}
                  onChange={(e) => updateField('consent', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-line text-brand focus:ring-brand"
                />
                <span>
                  I accept the <strong className="text-ink">Terms of Service</strong> and consent to simulated student banking data processing.
                </span>
              </label>
              {fieldErrors.consent && <p className="mt-1 text-[11px] text-err">{fieldErrors.consent}</p>}
            </div>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="flex gap-3 pt-2">
        {step > 1 && (
          <button
            type="button"
            disabled={loading}
            onClick={() => setStep((s) => s - 1)}
            className="flex-1 rounded-2xl border border-line bg-card py-3.5 text-sm font-semibold text-ink transition hover:bg-bg disabled:opacity-50"
          >
            Back
          </button>
        )}

        {step < 3 ? (
          <button
            type="button"
            onClick={() => {
              if (step === 1 && validateStep1()) setStep(2);
              if (step === 2 && validateStep2()) setStep(3);
            }}
            className="flex-1 rounded-2xl bg-btn py-3.5 text-sm font-semibold text-btntx shadow-sm transition hover:opacity-95"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            disabled={loading}
            onClick={handleCompleteRegistration}
            className="flex-1 rounded-2xl bg-btn py-3.5 text-sm font-semibold text-btntx shadow-sm transition hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Creating Account...
              </>
            ) : (
              'Complete Registration'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
