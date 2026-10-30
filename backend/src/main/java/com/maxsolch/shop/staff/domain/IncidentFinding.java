package com.maxsolch.shop.staff.domain;

/**
 * A case found in the data right now (the detector of «Инциденты» finds it, the incident service turns it into a card).
 * The codes of automatic cases start with {@link #AUTO}.
 */
public record IncidentFinding(String code, String title, String orderRef, String severity, String facts,
                              String hypothesis, String suggestion) {

    /** Prefix of the code of every automatic case (hand-made cards have none). */
    public static final String AUTO = "auto:";
    /** A refused parcel that has been «on its way back» longer than this is worth a look. */
    public static final int RETURN_STUCK_DAYS = 21;
}
