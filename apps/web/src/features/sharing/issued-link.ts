/** The link from the last create or resend. The api returns it once, so it lives here only. */
export interface IssuedLink {
  inviteId: string;
  email: string;
  link: string;
  emailed: boolean;
}
