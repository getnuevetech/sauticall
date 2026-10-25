export const DEPARTMENT_NAME_MAX = 50;

export const DEPARTMENT_NAME_RULES =
  "Use 1 to 50 characters. Start with a letter or a number. Letters, numbers, spaces, periods, hyphens, ampersands, and parentheses are allowed. Leave out apostrophes and other symbols. DEFAULT is reserved. The name has to be unique, and it becomes the department. People are added to that department.";

const DEPARTMENT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .&()-]*$/;

export function normalizeDepartmentName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function departmentNameIssue(name: string) {
  const trimmed = normalizeDepartmentName(name);
  if (!trimmed) return "Enter the company name. That name becomes the department, and people are added to it.";
  if (trimmed.length > DEPARTMENT_NAME_MAX) return "Use a company name of 50 characters or fewer.";
  if (/^default$/i.test(trimmed)) return "DEFAULT is reserved. Enter the company name so people are added to that department.";
  if (/^SautiCall \d+$/.test(trimmed)) return "Enter the company name. That name becomes the department, and people are added to it.";
  if (!DEPARTMENT_NAME_PATTERN.test(trimmed)) return "Use letters, numbers, spaces, periods, hyphens, ampersands, and parentheses. Start with a letter or a number, and leave out apostrophes and other symbols.";
  return "";
}

export function acceptedDepartmentName(name: string) {
  const trimmed = normalizeDepartmentName(name);
  return departmentNameIssue(trimmed) ? "" : trimmed;
}

export function departmentNameTakenMessage(name: string) {
  return `"${name}" is already a department. Choose a different company name. People are added to the company department.`;
}

export function departmentRejectedMessage(name: string) {
  return `The phone system did not accept "${name}" as the department. ${DEPARTMENT_NAME_RULES}`;
}

export function departmentCreateBody(name: string, from: number, to: number) {
  return {
    Name: name,
    Language: "EN",
    AllowCallService: true,
    Props: {
      UserNumberFrom: String(from),
      UserNumberTo: String(to),
    },
  };
}

export function departmentRangeBody(from: number, to: number) {
  return {
    Props: {
      UserNumberFrom: String(from),
      UserNumberTo: String(to),
    },
  };
}

export function userCreateBody(person: {
  firstName: string;
  lastName: string;
  email: string;
  number: string;
  password: string;
  groupId?: number;
}) {
  const body: Record<string, unknown> = {
    Id: 0,
    FirstName: person.firstName,
    LastName: person.lastName,
    EmailAddress: person.email,
    Number: person.number,
    Language: "EN",
    AccessPassword: person.password,
    SendEmailMissedCalls: false,
    VMEmailOptions: "Notification",
    Require2FA: false,
  };
  if (person.groupId) body.Groups = [{ GroupId: person.groupId, Rights: { RoleName: "users" } }];
  return body;
}
