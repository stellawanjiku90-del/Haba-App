# Haba — Kenya launch checklist

**Status:** pre-authorization concept. The public app is a demo only. Do not accept loan applications, make credit offers, or collect a fee until Haba is properly authorized and its production services are ready.

This is a project checklist, not legal advice. CBK requirements can change. Confirm the current forms, rules, fees, and sequence with CBK and Kenyan counsel before filing.

## 1. CBK name approval and company formation

CBK's October 2024 licensing procedure says a new digital credit provider starts with name approval. Prepare:

- At least three proposed company names, in order of preference, and a name reservation from the Registrar of Companies.
- Proposed shareholder names, addresses, and identification documents.
- A 3–5 page business brief: company profile and governance structure; product and delivery model; target market and market gap; shareholder business background; proposed product/app names; and initial capital with evidence and sources.
- Shareholder source-of-funds declarations certified by an advocate or commissioner of oaths, plus the other supporting evidence requested by CBK.
- A Kenya Industrial Property Institute no-objection letter for the proposed name(s).

Submit the name approval request through the CBK portal. Incorporate the limited company using a name approved by CBK.

## 2. CBK licence application

The currently linked procedure calls for Form CBK DCP 1 and fit-and-proper Forms DCP 2 and DCP 3 for directors, the CEO, senior officers, and significant shareholders. Its supporting-document list includes:

- Incorporation, registered address, and constitutional documents.
- An ICT-system description and independent assurance, plus delivery-channel/platform details.
- Credit products, customer terms, pricing model, and credit policy.
- Agreements with telecommunications or other service providers used for the credit channel.
- AML/CFT policies, data-protection policies, consumer complaint/redress procedures, code of ethics and market conduct, and governance policy.
- Fit-and-proper evidence for relevant people, including good-conduct, tax-compliance, and recent CRB reports as specified in the procedure.

The linked October 2024 procedure lists a KES 5,000 non-refundable application fee and a KES 20,000 licence fee, then requires CBK data-submission/API testing before licensing. Verify the current fees and process directly with CBK before payment or filing.

## 3. Data and platform design

- Use an SMS provider for OTP delivery and manual entry or a platform verification API. Do not request broad SMS-inbox access for credit scoring: Google Play restricts SMS/Call Log permissions to narrow eligible cases, and loan scoring is not listed as a permitted use.
- Use an appropriately authorized credit-data source and an affordability model reviewed for the Kenyan market. Do not produce live limits from the demo's fixed sample value.
- Use a user-selected contact picker for references, disclose why each reference is needed, and avoid uploading the full address book.
- Complete the privacy notices, data inventory, retention/deletion rules, consent and lawful-basis review, vendor contracts, security controls, data-subject request process, and any required DPIA before collecting real applicant or reference data.
- Keep payment integration disabled until the lender, product terms, fee legality, complete cost disclosures, and payment provider are confirmed.

## 4. Decisions and materials still needed

- Three proposed legal company names; shareholder/director list and ownership structure.
- Intended target borrowers, loan purpose, repayment terms, pricing, affordability policy, collections policy, complaint channel, and planned lending capital/source.
- Company and key-person documents for the official CBK portal. Do not place IDs, bank statements, KRA documents, or other confidential records in this public repository or chat.
- Chosen SMS/OTP, credit-data, M-Pesa/payment, disbursement, hosting, and independent ICT-assurance providers, with their contracts/accounts and credentials configured securely outside source control.
- CBK authorization and ODPC data-handler registration status before production collection begins.

## Official references

- [CBK revised DCP licensing procedure (October 2024)](https://www.centralbank.go.ke/wp-content/uploads/2024/11/Procedures-for-licensing-Digital-Credit-Providers-Revised-October-2024.pdf)
- [CBK legislation and guidelines](https://www.centralbank.go.ke/policy-procedures/legislation-and-guidelines/) — the page currently lists the 2022 DCP Regulations and a draft 2025 Non-Deposit Taking Credit Providers regulation; confirm which instrument is in force when filing.
- [Google Play SMS and Call Log permissions policy](https://support.google.com/googleplay/android-developer/answer/10208820)
- [ODPC Guidance Note for Digital Credit Providers](https://www.odpc.go.ke/wp-content/uploads/2024/02/ODPC-Guidance-Note-for-Digital-Credit-Providers.pdf)
- [ODPC data-handler registration](https://dataportal.odpc.go.ke/)

