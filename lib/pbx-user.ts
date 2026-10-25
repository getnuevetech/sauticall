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
