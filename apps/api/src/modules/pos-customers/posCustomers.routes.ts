import {
  Router,
} from "express";

import {
  z,
} from "zod";

import {
  createOfficialSiteCustomer,
  findOfficialSiteCustomerByPhone,
  getOfficialSiteCustomer,
  OfficialSiteApiError,
} from "../../lib/officialSite";

import {
  authMiddleware,
  requirePermission,
} from "../../middleware/auth.middleware";

const router =
  Router();

router.use(
  authMiddleware,
);

/* =======================================================
   VALIDATION
======================================================= */

const phoneLookupSchema =
  z.object({
    phone:
      z.string()
        .trim()
        .min(
          1,
          "Phone number is required",
        )
        .max(
          30,
          "Phone number is too long",
        ),
  });

const customerIdSchema =
  z.object({
    customerId:
      z.coerce
        .number()
        .int()
        .positive(),
  });

const createCustomerSchema =
  z.object({
    name:
      z.string()
        .trim()
        .min(
          1,
          "Customer name is required",
        )
        .max(
          255,
          "Customer name is too long",
        ),

    phone:
      z.string()
        .trim()
        .min(
          1,
          "Phone number is required",
        )
        .max(
          30,
          "Phone number is too long",
        ),

    email:
      z.union([
        z.string()
          .trim()
          .email(
            "Enter a valid email address",
          )
          .max(
            255,
            "Email address is too long",
          ),

        z.literal(""),

        z.null(),
      ])
        .optional(),

    defaultDeliveryAddress:
      z.union([
        z.string()
          .trim()
          .max(
            1000,
            "Delivery address is too long",
          ),

        z.literal(""),

        z.null(),
      ])
        .optional(),
  });

/* =======================================================
   HELPERS
======================================================= */

function sendOfficialSiteError(
  res: Parameters<
    Parameters<
      typeof router.get
    >[1]
  >[1],
  error: unknown,
) {
  if (
    error instanceof
    OfficialSiteApiError
  ) {
    /*
     * The official website is authoritative
     * for customer validation.
     *
     * Preserve useful validation/conflict
     * status codes for the POS frontend.
     */
    const status =
      error.status >= 400 &&
      error.status <= 599
        ? error.status
        : 502;

    return res
      .status(status)
      .json({
        message:
          error.message,

        code:
          error.code,

        errors:
          error.errors,
      });
  }

  console.error(
    "POS customer operation failed:",
    error,
  );

  return res
    .status(500)
    .json({
      message:
        "Failed to process POS customer request",
    });
}

/* =======================================================
   LOOKUP CUSTOMER BY PHONE
======================================================= */

/*
 * GET /lookup?phone=0771234567
 *
 * The ERP does NOT independently normalize
 * Sri Lankan phone numbers here.
 *
 * The official website remains authoritative
 * for phone normalization and customer identity.
 */
router.get(
  "/lookup",

  requirePermission(
    "erp.pos.access",
  ),

  async (
    req,
    res,
  ) => {
    const parsed =
      phoneLookupSchema.safeParse(
        req.query,
      );

    if (
      !parsed.success
    ) {
      return res
        .status(400)
        .json({
          message:
            "Invalid customer lookup",

          errors:
            parsed.error
              .flatten(),
        });
    }

    try {
      const customer =
        await findOfficialSiteCustomerByPhone(
          parsed.data.phone,
        );

      if (!customer) {
        return res.json({
          found:
            false,

          customer:
            null,
        });
      }

      return res.json({
        found:
          true,

        customer,
      });
    } catch (error) {
      return sendOfficialSiteError(
        res,
        error,
      );
    }
  },
);

/* =======================================================
   GET CUSTOMER BY CANONICAL ID
======================================================= */

/*
 * This endpoint will also be useful when
 * completing a sale.
 *
 * The POS frontend may retain a canonical
 * customer ID, but the backend can re-fetch
 * the authoritative customer before posting
 * the sale.
 */
router.get(
  "/:customerId",

  requirePermission(
    "erp.pos.access",
  ),

  async (
    req,
    res,
  ) => {
    const parsed =
      customerIdSchema.safeParse(
        req.params,
      );

    if (
      !parsed.success
    ) {
      return res
        .status(400)
        .json({
          message:
            "Valid customer ID is required",

          errors:
            parsed.error
              .flatten(),
        });
    }

    try {
      const customer =
        await getOfficialSiteCustomer(
          parsed.data.customerId,
        );

      return res.json({
        customer,
      });
    } catch (error) {
      return sendOfficialSiteError(
        res,
        error,
      );
    }
  },
);

/* =======================================================
   REGISTER CUSTOMER
======================================================= */

/*
 * POST /
 *
 * This does NOT create an ERP customer row.
 *
 * Customer registration is delegated to the
 * official website, which writes to its
 * canonical users table.
 */
router.post(
  "/",

  requirePermission(
    "erp.pos.access",
  ),

  async (
    req,
    res,
  ) => {
    const parsed =
      createCustomerSchema.safeParse(
        req.body,
      );

    if (
      !parsed.success
    ) {
      return res
        .status(400)
        .json({
          message:
            "Invalid customer registration data",

          errors:
            parsed.error
              .flatten(),
        });
    }

    try {
      const email =
        parsed.data.email
          ?.trim() ||
        null;

      const defaultDeliveryAddress =
        parsed.data
          .defaultDeliveryAddress
          ?.trim() ||
        null;

      const customer =
        await createOfficialSiteCustomer({
          name:
            parsed.data.name,

          phone:
            parsed.data.phone,

          email,

          default_delivery_address:
            defaultDeliveryAddress,
        });

      return res
        .status(201)
        .json({
          message:
            "Customer registered successfully",

          customer,
        });
    } catch (error) {
      /*
       * Laravel may return:
       *
       * 409 CUSTOMER_ALREADY_EXISTS
       * 409 PHONE_ALREADY_IN_USE
       * 422 validation failure
       *
       * Those responses are intentionally
       * forwarded to the POS frontend.
       */
      return sendOfficialSiteError(
        res,
        error,
      );
    }
  },
);

export default router;