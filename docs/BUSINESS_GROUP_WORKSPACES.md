# Business groups, workspaces, branches, and managers

## Structure

```text
Business group
├── Workspace: one country or legal company
│   ├── Branch
│   └── Branch
└── Workspace: another country or legal company
    └── Branch
```

- A **business group** is the parent organisation controlled by the protected owner.
- A **workspace** owns its regional and financial configuration, including country, currency, tax, payment methods, phone details, customers, members, reports, and integrations.
- A **branch** is an operating location inside one workspace. It inherits the workspace country and regional defaults.

The first owner signup creates the group, first workspace, and main branch. The owner later adds another workspace from **Business Group** and adds same-country locations from **Branches**.

## Manager access

| Manager | Scope | Main restriction |
| --- | --- | --- |
| Branch Manager | Assigned branch or branches | Cannot view or change another branch or workspace-level settings |
| Workspace Manager | One workspace and all of its branches | Cannot transfer ownership, create an owner, or manage the business group |
| Group Manager | Every workspace in the business group | Cannot transfer ownership, create an owner, or delete the group |
| Owner | Entire business group | Protected ownership rights |

Workspace and branch managers are assigned from **Members** using the corresponding saved role. A group manager must first be an existing member of any workspace in the group, then the owner promotes them from **Business Group**.

## Regional defaults

The API accepts and stores only these country codes:

- `ZW` — Zimbabwe
- `ZA` — South Africa

The interface displays full country names. Branch creation does not accept a country field; it derives the country from its workspace.

Current defaults:

| Country | Currency | Timezone | Allowed payment methods |
| --- | --- | --- | --- |
| Zimbabwe | USD | Africa/Harare | Cash, bank transfer, Paynow |
| South Africa | ZAR | Africa/Johannesburg | Cash, bank transfer, Ozow, Yoco, PayFast, SnapScan |

Payment credentials, sender numbers, tax registration, branding, and integrations remain separate for each workspace. Creating a workspace does not copy a paid subscription entitlement; the new workspace goes through plan selection.

## Deployment

From the project root:

```bash
npm install
npx prisma migrate deploy
npx prisma generate
npm run seed
npm test
```

Deploy the database migration before starting application instances that use the new Prisma client.

## Existing data

The migration is non-destructive:

- Every existing workspace becomes a one-workspace business group.
- Existing workspace owners become protected group owners.
- Existing branch country values are normalized to `ZW` or `ZA` using workspace finance settings and market configuration.
- Existing jobs, customers, invoices, payments, users, and branch assignments stay in their current workspace.
