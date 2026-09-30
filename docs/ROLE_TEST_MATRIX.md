# CareOrbit role test matrix

No test accounts were created and no role login was attempted. The live database has no `auth_users`, profiles, or user roles, so browser role testing is blocked without creating production records. This is intentional: the attached QA brief requires a verified data gate before account creation.

| Role | Feature | View | Create | Edit | Delete | Restricted | API tested | UI tested | Performance | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Super Admin | System administration | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | No | No | No | BLOCKED | No auth table/test user |
| Hospital Admin | Hospital operations | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | No | No | No | BLOCKED | No auth table/test user |
| Admin | Administrative operations | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | No | No | No | BLOCKED | No auth table/test user |
| Staff | Patient and queue workflows | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | No | No | No | BLOCKED | No auth table/test user |
| Doctor | Clinical workflows | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | No | No | No | BLOCKED | No auth table/test user |
| Nurse | Clinical workflows | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | No | No | No | BLOCKED | No auth table/test user |
| Pharmacist | Pharmacy workflows | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | No | No | No | BLOCKED | No auth table/test user/API transactions |
| Lab Technician | Lab workflows | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | No | No | No | BLOCKED | No auth table/test user/API transactions |
| Billing Operator | Billing workflows | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | No | No | No | BLOCKED | No auth table/test user/API transactions |
