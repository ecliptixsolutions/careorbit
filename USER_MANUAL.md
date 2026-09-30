# CareOrbit User Manual

Last updated: 2026-05-20

## 1. Introduction

CareOrbit is a healthcare ERP, EMR, and AI-ready web application for clinics and hospitals. It helps healthcare teams manage patient records, guardian emergency contacts, appointment scheduling, and basic operational dashboard reporting from one browser-based system.

The current application includes:

- Public CareOrbit landing page.
- Email and password sign in.
- Account signup with role selection.
- Password strength checklist.
- Show/hide password control.
- Suggested strong password generation.
- Protected dashboard.
- Patient management.
- Appointment scheduling.
- Guardian emergency contact capture.
- Doctor name capture while adding a patient.
- Patient problem/disease briefing for appointments.
- Role-wise UI context showing the current role and available rights.

The current application does not expose Google login, OTP login, or email verification screens.

## 2. Accessing the Application

Use the application from the deployed test URL or from the local development URL provided by the project team.

Current Cloudflare test deployment:

```text
https://oehealth-erp-test.sharefile740-ludo.workers.dev
```

Local development URL, when the developer server is running:

```text
http://localhost:5174
```

The application is browser based. No desktop installation is required for normal users.

## 3. User Roles

CareOrbit supports the following role choices during signup.

| Role   | Intended user                                                               | Current application behavior                                                                                                                                           |
| ------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin  | Clinic owner, hospital administrator, system manager                        | Can sign in and use dashboard, patients, and appointments. The UI shows Admin access context. Backend policies allow admin-only delete where delete UI is later added. |
| Doctor | Doctor or consultant                                                        | Can access patient and appointment records after sign in. The UI shows Doctor access context. Appointment creation stores the current user as doctor.                  |
| Staff  | Reception, front desk, operations staff                                     | Default role. Can register patients, assign doctor names, and schedule appointments. The UI shows Staff access context.                                                |
| Custom | Pharmacist, nurse, lab technician, billing operator, or another custom role | Can enter a custom role label during signup. The UI shows the custom role label and shared operational rights.                                                         |

Current role-wise UI behavior:

- The sidebar shows the signed-in user's role.
- Mobile header shows the signed-in user's role.
- Dashboard shows a role-wise access panel.
- Patient and appointment pages show the current role and action rights.
- Navigation is permission-aware, but all current roles retain access to the same core screens because the current backend policies allow the same core workflow for Admin, Doctor, Staff, and Custom roles.

## 4. Public Website

The public landing page is available at:

```text
/
```

Main sections:

- Header with CareOrbit logo.
- Features.
- Why Choose Us.
- Contact.
- Hero section with product summary.
- Call-to-action buttons for signup and login.

Header navigation:

- `Features` scrolls to the feature section.
- `Why Choose Us` scrolls to the trust and benefits section.
- `Contact` scrolls to the final call-to-action section.
- `Sign in` opens the login page.
- `Book now` opens the signup page.

Primary landing page actions:

- Use `Book a demo` or `Create your account` to create a new account.
- Use `Sign in` to access an existing account.
- Use `Explore features` to review system capabilities.

## 5. Creating an Account

Open:

```text
/signup
```

### Signup Fields

| Field             | Required                          | Description                                                   |
| ----------------- | --------------------------------- | ------------------------------------------------------------- |
| Full name         | Yes                               | User's full name.                                             |
| Organization      | No                                | Clinic or hospital name.                                      |
| Your role         | Yes                               | Admin, Doctor, Staff, or Custom role.                         |
| Custom role label | Required only for custom role use | Example: Pharmacist, Nurse, Lab Technician, Billing Operator. |
| Email             | Yes                               | User login email address.                                     |
| Password          | Yes                               | Password that satisfies all strength requirements.            |

### Password Rules

The password must satisfy every rule below:

- At least 8 characters.
- One uppercase letter.
- One lowercase letter.
- One number.
- One special character.

The signup button remains disabled until the password meets all requirements.

### Suggested Password

Use the `Suggest` button to generate a strong random password.

When a suggested password is generated:

- The password field is filled automatically.
- The password is shown so the user can save it.
- The password checklist should become fully valid.

The user must store the suggested password securely before submitting the form.

### Show/Hide Password

Use the eye icon inside the password field to switch between hidden and visible password text.

### Signup Result

After successful signup:

- The system creates the account in Supabase Auth.
- The backend creates a profile and role record.
- The user is signed in automatically when possible.
- The user is redirected to the dashboard.

If automatic sign-in is not available, the system sends the user to the login page.

## 6. Signing In

Open:

```text
/login
```

### Login Fields

| Field    | Required | Description               |
| -------- | -------- | ------------------------- |
| Email    | Yes      | Registered email address. |
| Password | Yes      | Account password.         |

Use the eye icon to show or hide the password.

After successful login:

- A success message appears.
- The user is redirected to the dashboard.

If login fails:

- A visible error toast appears.
- Check that the email and password are correct.
- Confirm that the account exists.

## 7. Signing Out

After login, use the `Sign out` button in the sidebar.

On desktop:

- The sign out button appears at the bottom of the left sidebar.

On mobile:

- A sign out icon appears in the top mobile header.

After signing out:

- The user session is cleared.
- The application returns to the public home page.
- Protected pages redirect to login if opened again.

## 8. Dashboard

Open:

```text
/dashboard
```

The dashboard is the default authenticated overview screen.

Dashboard cards:

| Card                 | Description                                               |
| -------------------- | --------------------------------------------------------- |
| Total patients       | Count of patient records available to the signed-in user. |
| Total appointments   | Count of appointments available to the signed-in user.    |
| Today's appointments | Count of appointments scheduled for the current day.      |
| Active modules       | Product capability indicator. Currently shows 12.         |

The dashboard also displays a welcome message using the user's profile name and organization when available.

## 9. Patient Management

Open:

```text
/patients
```

The Patients screen allows authenticated users to:

- View patient records.
- Search patients.
- Add a new patient.
- Capture guardian emergency contact details.

### Patient List

The table displays:

- MRN.
- Name.
- Date of birth.
- Phone.
- Guardian contact.
- Blood group.

Some columns are hidden on smaller screens to keep the table usable.

### Searching Patients

Use the search box above the table.

Search currently checks:

- Patient name.
- MRN.
- Doctor name.
- Guardian emergency contact.

### Adding a Patient

Click:

```text
New patient
```

The Add Patient modal opens.

Patient form fields:

| Field                      | Required | Notes                                                |
| -------------------------- | -------- | ---------------------------------------------------- |
| Full name                  | Yes      | Main required patient identifier.                    |
| Date of birth              | No       | Uses browser date picker.                            |
| Gender                     | No       | Male, Female, or Other.                              |
| Phone                      | No       | Patient contact number.                              |
| Doctor name                | No       | Assigned or consulting doctor name for this patient. |
| Guardian emergency contact | No       | Guardian or emergency contact number.                |
| Email                      | No       | Patient email.                                       |
| Blood group                | No       | Example: O+, A-, B+.                                 |
| Allergies                  | No       | Allergy summary.                                     |
| Address                    | No       | Patient address.                                     |
| Notes                      | No       | General patient notes.                               |

Click `Save patient` to create the record.

After successful save:

- A success message appears.
- The modal closes.
- The patient list refreshes.
- A generated MRN appears for the patient.
- The doctor name appears in the Doctor column on desktop-sized screens.

### Guardian Emergency Contact Handling

The guardian emergency contact is stored inside the patient notes using this prefix:

```text
Guardian emergency contact:
```

The patient list extracts that value and shows it in the Guardian column.

### Doctor Name Handling

The doctor name is captured during patient creation and stored inside the patient notes using this prefix:

```text
Assigned doctor:
```

The patient list extracts that value and shows it in the Doctor column on larger screens. Patient search also checks the assigned doctor name.

### Current Patient Module Limitations

The current UI supports patient creation and listing. It does not currently expose:

- Patient edit form.
- Patient delete button.
- Patient detail page.
- Medical history timeline.
- File upload.
- Prescription records.
- Dedicated database column for assigned doctor name. The current release stores it inside patient notes with a structured prefix.

## 10. Appointment Scheduling

Open:

```text
/appointments
```

The Appointments screen allows authenticated users to:

- View appointment list.
- Schedule a new appointment.
- Select patient.
- Enter appointment date and time.
- Enter problem/disease brief.

### Appointment List

The table displays:

- Appointment time.
- Patient name.
- MRN.
- Problem/disease brief.
- Appointment status.

Status values:

- scheduled.
- confirmed.
- completed.
- cancelled.
- no_show.

### Requirement Before Scheduling

At least one patient must exist before scheduling an appointment.

If no patient exists:

- The `New appointment` button is disabled.
- A message asks the user to add a patient first.

### Creating an Appointment

Click:

```text
New appointment
```

Appointment form fields:

| Field                           | Required | Notes                                                  |
| ------------------------------- | -------- | ------------------------------------------------------ |
| Patient                         | Yes      | Select from existing patients.                         |
| Date & time                     | Yes      | Uses browser date-time picker.                         |
| Duration                        | No       | Defaults to 30 minutes. Minimum value is 5. Step is 5. |
| Patient problem / disease brief | No       | Short medical or visit reason summary.                 |

Click `Schedule appointment` to save.

After successful save:

- A success message appears.
- The modal closes.
- The appointment list refreshes.

### Patient Problem/Disease Brief

This field helps doctors and staff quickly understand the appointment context.

Recommended examples:

- Fever for 3 days.
- Diabetes follow-up.
- Post-surgery review.
- Chest pain consultation.
- Routine checkup.

### Current Appointment Module Limitations

The current UI supports appointment creation and listing. It does not currently expose:

- Appointment edit screen.
- Appointment delete button.
- Appointment status update buttons.
- Doctor selection dropdown.
- Calendar view.
- Appointment reminders.

## 11. Navigation

After login, the application shell provides:

| Menu item    | Route           | Purpose                          |
| ------------ | --------------- | -------------------------------- |
| Overview     | `/dashboard`    | Operational dashboard.           |
| Patients     | `/patients`     | Patient records and creation.    |
| Appointments | `/appointments` | Appointment scheduling and list. |

Desktop navigation appears in the left sidebar.

Mobile navigation appears as a top header and horizontal tab bar.

## 12. Responsive Use

CareOrbit supports desktop and mobile layouts.

On desktop:

- Sidebar is visible.
- Main content uses a wider table layout.
- More patient and appointment columns are visible.

On mobile:

- Sidebar changes into a compact top header.
- Navigation becomes horizontal.
- Some table columns are hidden to reduce overflow.
- Forms remain inside modal dialogs.

Recommended mobile checks:

- Confirm buttons remain visible.
- Confirm modal content can be scrolled.
- Confirm table rows do not overlap.
- Confirm navigation tabs can be horizontally scrolled when needed.

## 13. Common User Errors and Fixes

| Problem                           | Likely reason                            | Action                                    |
| --------------------------------- | ---------------------------------------- | ----------------------------------------- |
| Signup button disabled            | Password is weak                         | Complete every password rule.             |
| Cannot schedule appointment       | No patient exists                        | Add a patient first.                      |
| Login fails                       | Wrong email/password or account missing  | Recheck credentials or create an account. |
| Protected page redirects to login | User is signed out                       | Sign in again.                            |
| Patient not visible after save    | List is still refreshing or save failed  | Wait briefly and check for error toast.   |
| Date or time not accepted         | Browser rejected invalid date-time value | Use the browser picker and a valid value. |

## 14. Recommended Operating Procedure

Daily front desk flow:

1. Sign in.
2. Open Patients.
3. Search whether the patient already exists.
4. Add the patient if not found.
5. Capture phone and guardian emergency contact.
6. Open Appointments.
7. Create a new appointment.
8. Select the patient.
9. Enter date, time, duration, and patient problem/disease brief.
10. Confirm the appointment appears in the list.

Doctor review flow:

1. Sign in.
2. Open Dashboard to review today's activity.
3. Open Appointments.
4. Review patient name, MRN, time, and problem/disease brief.
5. Open Patients if patient demographics or guardian information is needed.

Admin review flow:

1. Sign in as Admin.
2. Review Dashboard counts.
3. Check Patients for new records.
4. Check Appointments for scheduling volume.
5. Report any incorrect role or access issue to the technical team.

## 15. Data Privacy and Safety Notes

CareOrbit stores healthcare-related information. Users should:

- Use strong passwords.
- Keep passwords private.
- Sign out on shared computers.
- Avoid entering test attack payloads in production records.
- Avoid storing unnecessary sensitive data in notes fields.
- Verify guardian phone numbers before saving.
- Follow the clinic or hospital privacy policy.

## 16. User Acceptance Checklist

Use this checklist after a release:

- Landing page loads.
- Header shows CareOrbit branding.
- Features navigation scrolls correctly.
- Why Choose Us navigation scrolls correctly.
- Signup page opens.
- Password checklist works.
- Suggest password works.
- Show/hide password works.
- Signup succeeds with valid details.
- Login succeeds with valid credentials.
- Dashboard loads after login.
- Dashboard shows role-wise access.
- Sidebar or mobile header shows the current role.
- Patient can be created.
- Guardian emergency contact appears in patient table.
- Doctor name can be entered in the patient form.
- Doctor name appears in the patient table on desktop-sized screens.
- Patient search works by name.
- Patient search works by MRN.
- Patient search works by doctor name.
- Patient search works by guardian number.
- Appointment button is disabled when there are no patients.
- Appointment can be created after adding a patient.
- Patient problem/disease brief appears in appointment table.
- Sign out clears the session.
- Protected routes redirect to login after sign out.

## 20. Latest Admin, Role, and Module Update

This release adds the larger role-wise workflow requested for CareOrbit.

### New Role Types

CareOrbit now supports these role views in the UI:

- Super Admin.
- Hospital Admin.
- Admin.
- Doctor.
- Staff.
- Nurse.
- Pharmacist.
- Lab Technician.
- Billing Operator.

New accounts are created as pending approval requests. The user selects the requested role during signup, but workflow access is not enabled until an administrator approves the account.

### Pending User Approval

New user flow:

1. User opens `/signup`.
2. User selects a requested role.
3. User creates account.
4. User sees a waiting-for-approval screen.
5. Super Admin, Hospital Admin, or Admin opens `/access-control`.
6. Admin assigns the approved role.
7. User signs in again or refreshes.
8. Role-wise screens and module permissions become visible.

### Access Control

Open:

```text
/access-control
```

Available for:

- Super Admin.
- Hospital Admin.
- Admin.

Access Control allows administrators to:

- View users.
- See pending role requests.
- Approve users.
- Assign Super Admin, Hospital Admin, Admin, Doctor, Staff, Nurse, Pharmacist, Lab Technician, or Billing Operator.
- Create custom role templates.
- Assign custom role templates.
- Review the rights matrix for every built-in role.

Super Admin rule:

- The UI allows only one Super Admin assignment from the approval screen.
- For strict production enforcement, the database should also include a unique Super Admin rule.

### Patient History By Number

Open:

```text
/patient-history
```

Available for:

- Super Admin.
- Hospital Admin.
- Admin.
- Doctor.
- Nurse.
- Approved clinical roles.

Users can search patient history by:

- Patient phone number.
- Guardian emergency contact number.
- MRN.
- Patient name.

The screen shows:

- Patient details.
- Guardian contact.
- Assigned doctor.
- Blood group.
- Appointment history.
- Problem/disease briefs.
- Appointment status.

### ERP Modules

Open:

```text
/modules
```

This screen now lists all modules from the reference image:

- Patient Management.
- IPD / OPD Management.
- Medical Staff Management.
- Quick Consultations.
- AI & Voice Consultation.
- Lab Management.
- Pharmacy.
- Billing & Accounting.
- Inventory Management.
- Surgery.
- Radiology & DICOM Viewer.
- Telemedicine.

Each module shows:

- `Allowed` when the current role has rights.
- `Restricted` when the current role does not have rights.

Live module links:

- Patient Management opens the Patients screen.
- Quick Consultations and Telemedicine open the Appointments workflow.

The other module cards are role-aware workspace entries and can be expanded into full database-backed workflows.

### Role-Wise Rights Summary

| Role             | Main rights                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Super Admin      | All modules, approvals, role assignment, role templates, users, patients, appointments, history. |
| Hospital Admin   | Hospital-level approvals, users, roles, patients, appointments, history, all modules.            |
| Admin            | Operational approvals, users, roles, patients, appointments, history, all modules.               |
| Doctor           | Patient history by number, patients, appointments, consultations, AI/voice, telemedicine.        |
| Staff            | Patient registration, doctor assignment, guardian contact, appointments, IPD/OPD, inventory.     |
| Nurse            | Patient history, patients, appointments, IPD/OPD, quick consultations.                           |
| Pharmacist       | Pharmacy module, patient context, appointment context.                                           |
| Lab Technician   | Lab module, patient context, appointment context.                                                |
| Billing Operator | Billing/accounting module, patient context, appointment context.                                 |

Important implementation note:

- The live Supabase database currently has the safe base enum roles `admin`, `doctor`, `staff`, and `custom`.
- Extended roles are stored through approved admin/custom labels so deployment does not break existing database enum constraints.
- For deeper production enforcement, apply a Supabase migration that adds dedicated approval and role-template tables.

## 21. Smart Queue, EMR, and Automation Update

### Smart Appointment and Queue Management

Open:

```text
/appointments
```

New appointment now captures:

- Patient.
- Doctor name.
- Separate appointment date.
- Separate appointment time.
- Duration in minutes.
- Problem/disease brief.
- Internal appointment notes.

Open:

```text
/queue
```

Queue features now available:

- Live queue screen for today's appointments.
- Automatic queue token generation.
- Predicted waiting time based on appointment order and duration.
- QR check-in code per appointment.
- Reception check-in button.
- Completed visit button.
- Face-lookup workflow field for reception validation.

Note: QR check-in is live. Real face recognition requires a biometric provider integration.

### Automated Follow-ups and WhatsApp

Open:

```text
/automations
```

The automation screen prepares:

- Appointment reminders.
- Revisit reminders.
- Missed appointment recovery messages.
- Prescription PDF messages.
- Lab report messages.
- Medicine reminders.
- WhatsApp message links.
- AI chatbot intent preview for messages such as `Book appointment with Dr Shah tomorrow`.

Important: The screen creates WhatsApp-ready messages and logs prepared activity. Fully automatic background sending requires a WhatsApp Business API provider, webhook, and scheduled job.

### Smart EMR Timeline

Open:

```text
/emr-timeline
```

The EMR timeline shows:

- Patient profile.
- Visits.
- Problem/diagnosis briefs.
- Prescription status.
- Lab/radiology report status.
- Billing timeline placeholder.
- Vitals capture placeholder.

This view is available to doctor, nurse, clinical, and admin roles according to rights.

### Role-Based Dashboards

The dashboard now changes widgets by role:

- Doctor dashboard.
- Reception dashboard.
- Nurse dashboard.
- Pharmacy dashboard.
- Lab dashboard.
- Billing dashboard.
- Hospital Admin dashboard.
- Super Admin dashboard.

The visible navigation and dashboard widgets are driven by assigned role rights.
