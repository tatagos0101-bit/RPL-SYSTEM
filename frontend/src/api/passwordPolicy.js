export const passwordPolicyMessage = 'Use 8–128 characters, including at least one digit.';
export const isValidNewPassword = (value) => [...value].length >= 8 && [...value].length <= 128 && /\p{Nd}/u.test(value);
