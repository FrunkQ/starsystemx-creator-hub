// THE PROVENANCE ATTESTATION - one source of truth, shared by the form and the record.
//
// WHY IT IS IN $lib AND NOT IN THE PAGE: the text shown to the creator and the text stored against
// their answer must be the SAME STRING. If the page owned its own copy, the two would drift on the
// first wording tweak and the stored record would quietly stop being evidence of anything.
//
// WHY IT EXISTS AT ALL. A creator can credit everything to themselves and there is no way to
// disprove it. The honest position is the one the owner set: assume people are honest, ask them
// plainly, and record that they were asked. Responsibility then sits with the person who ticked it
// rather than with a hub that never mentioned it.
//
// WHAT IT IS NOT: a substitute for the provenance gate. An asset with nothing recorded still blocks
// publishing until it is filled in. This covers the part a machine cannot check - whether what they
// filled in is TRUE.

export const ATTESTATION_TEXT_VERSION = 1;

export const ATTESTATION_TEXT =
  'I made everything in this save, or I have the right to share it, and the credits and licences ' +
  'I have recorded are accurate to the best of my knowledge. I understand that maps here are ' +
  'downloaded and reused by other people, and that if a claim is made about this map I am the ' +
  'person responsible for it.';

/** Shown under the checkbox. Sets the tone: this is a community of makers, not a compliance form. */
export const ATTESTATION_NOTE =
  'We take you at your word. Nobody here can check who really made a picture, so the hub runs on ' +
  'trust - and on people crediting the artists whose work they use.';
