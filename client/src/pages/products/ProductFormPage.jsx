import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import PageHeader from "../../components/layout/PageHeader";
import Field from "../../components/ui/Field";
import ImagePicker from "../../components/products/ImagePicker";
import { useAuth } from "../../context/AuthContext";
import { useCategories } from "../../hooks/useCategories";
import { useImageUrls } from "../../hooks/useImageUrls";
import { getProduct, productError, saveProduct } from "../../data/products";
import { listSupplierOptions } from "../../data/suppliers";
import { prepareImage } from "../../lib/images";
import { formatMoney, formatQty } from "../../lib/format";
import DeleteProductModal from "../../components/products/DeleteProductModal";

const EMPTY = {
  name: "",
  sku: "",
  barcode: "",
  description: "",
  unit: "pcs",
  cost_price: "",
  selling_price: "",
  min_stock_level: "0",
  category_id: "",
  supplier_id: "",
  is_active: true,
};

const toForm = (p) => ({
  name: p.name,
  sku: p.sku ?? "",
  barcode: p.barcode ?? "",
  description: p.description ?? "",
  unit: p.unit,
  cost_price: String(p.cost_price),
  selling_price: String(p.selling_price),
  min_stock_level: String(p.min_stock_level),
  category_id: p.category_id ?? "",
  supplier_id: p.supplier_id ?? "",
  is_active: p.is_active,
});

const toNumber = (s) => Number(String(s).replace(/,/g, ""));

const UNIT_BAD_CHAR = /[^\p{L} ]/u; // anything that is not a letter or a space
const UNIT_MESSAGE =
  "Letters only. The unit is the word you count in (pcs, kg, box). How many you have is set in Inventory.";

// Returns { errors, fields }. `fields` holds only columns the database lets the app write.
function validate(f) {
  const errors = {};
  const unit = f.unit.trim().replace(/\s+/g, " ");
  if (!f.name.trim()) errors.name = "Enter a product name.";
  if (!unit) errors.unit = "Enter a unit, such as pcs or kg.";
  else if (UNIT_BAD_CHAR.test(unit)) errors.unit = UNIT_MESSAGE;

  const cost = toNumber(f.cost_price);
  const price = toNumber(f.selling_price);
  const min = toNumber(f.min_stock_level || "0");
  if (f.cost_price === "" || !Number.isFinite(cost) || cost < 0)
    errors.cost_price = "Enter a cost of 0 or more.";
  if (f.selling_price === "" || !Number.isFinite(price) || price < 0)
    errors.selling_price = "Enter a price of 0 or more.";
  if (!Number.isFinite(min) || min < 0)
    errors.min_stock_level = "Enter 0 or more.";

  return {
    errors,
    fields: {
      name: f.name.trim(),
      sku: f.sku.trim() || null,
      barcode: f.barcode.trim() || null,
      description: f.description.trim() || null,
      unit,
      cost_price: Math.round(cost * 100) / 100,
      selling_price: Math.round(price * 100) / 100,
      min_stock_level: min,
      category_id: f.category_id || null,
      supplier_id: f.supplier_id || null,
      is_active: f.is_active,
    },
  };
}

function ProductForm({ productId }) {
  const isEdit = Boolean(productId);
  const navigate = useNavigate();
  const { business, isOwner } = useAuth();
  const businessId = business.id;
  const symbol = business.currency_symbol ?? "₦";
  const { categories } = useCategories();

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [notFound, setNotFound] = useState(false);
  const [product, setProduct] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [image, setImage] = useState(null); // { blob, ext, previewUrl } for a newly picked image
  const [removeImage, setRemoveImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Active suppliers, plus this product's current supplier even if it was deactivated.
  const currentSupplierId = product?.supplier_id ?? null;
  useEffect(() => {
    let cancelled = false;
    listSupplierOptions(businessId, currentSupplierId).then(({ data }) => {
      if (!cancelled) setSuppliers(data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, currentSupplierId]);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    getProduct(businessId, productId).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) setNotFound(true);
      else {
        setProduct(data);
        setForm(toForm(data));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isEdit, businessId, productId]);

  const existingUrls = useImageUrls([product?.image_path]);
  const currentUrl =
    image?.previewUrl ??
    (removeImage ? null : existingUrls[product?.image_path]);
  const hasImage =
    Boolean(image) || (!removeImage && Boolean(product?.image_path));

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // The unit is a word (pcs, kg, box). Anything else is removed as you type, with a short explanation.
  function onUnitChange(e) {
    const raw = e.target.value;
    setForm((f) => ({ ...f, unit: raw.replace(/[^\p{L} ]/gu, "") }));
    setErrors((prev) => ({
      ...prev,
      unit: UNIT_BAD_CHAR.test(raw) ? UNIT_MESSAGE : undefined,
    }));
  }

  async function onPickImage(file) {
    setImageError("");
    try {
      const prepared = await prepareImage(file);
      setImage((prev) => {
        if (prev) URL.revokeObjectURL(prev.previewUrl);
        return { ...prepared, previewUrl: URL.createObjectURL(prepared.blob) };
      });
      setRemoveImage(false);
    } catch (err) {
      setImageError(err.message);
    }
  }

  function onRemoveImage() {
    if (image) URL.revokeObjectURL(image.previewUrl);
    setImage(null);
    setRemoveImage(true);
  }

  function onDeleted(result) {
    setDeleteOpen(false);
    navigate("/products", {
      state: {
        notice:
          result === "deleted"
            ? `“${product.name}” was permanently deleted.`
            : `“${product.name}” was deleted. Its past sales and stock history are kept.`,
      },
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    setFormError("");
    const { errors: found, fields } = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      await saveProduct({
        businessId,
        id: productId,
        fields,
        newImage: image,
        removeImage,
        previousPath: product?.image_path ?? null,
      });
      navigate("/products", {
        state: isEdit
          ? undefined
          : {
              notice: `“${fields.name}” was added. To record how many you have, open Inventory and choose Update stock.`,
            },
      });
    } catch (err) {
      setFormError(productError(err));
      setBusy(false);
    }
  }

  const cost = toNumber(form.cost_price);
  const price = toNumber(form.selling_price);
  let marginHint;
  if (
    form.selling_price !== "" &&
    form.cost_price !== "" &&
    Number.isFinite(cost) &&
    Number.isFinite(price) &&
    price > 0
  ) {
    marginHint =
      price < cost
        ? `Selling below cost: a loss of ${formatMoney(cost - price, symbol)} per unit.`
        : `Margin ${(((price - cost) / price) * 100).toFixed(1)}%, a profit of ${formatMoney(price - cost, symbol)} per unit.`;
  }

  const categoryOptions = categories.filter(
    (c) => c.is_active || c.id === form.category_id,
  );

  const selectedSupplier = suppliers.find((s) => s.id === form.supplier_id);
  const activeSupplierCount = suppliers.filter(
    (s) => s.is_active !== false,
  ).length;
  let supplierHint;
  if (selectedSupplier && selectedSupplier.is_active === false)
    supplierHint =
      "This supplier is inactive. You can keep it or choose another.";
  else if (activeSupplierCount === 0)
    supplierHint =
      "No active suppliers yet. Add them under Inventory › Suppliers.";
  if (loading) {
    return (
      <>
        <PageHeader title="Edit product" />
        <section className="card empty">
          <div className="spinner" style={{ margin: "0 auto" }} />
        </section>
      </>
    );
  }
  if (notFound) {
    return (
      <>
        <PageHeader title="Product not found" />
        <section className="card empty">
          <p className="card__sub">
            This product does not exist, or it belongs to another business.
          </p>
          <Link
            to="/products"
            className="btn btn--secondary"
            style={{ marginTop: "var(--space-4)" }}
          >
            Back to products
          </Link>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={isEdit ? "Edit product" : "Add product"}
        subtitle={
          isEdit ? product.name : "Add something you sell to your catalogue"
        }
      />

      <form className="form-grid" onSubmit={onSubmit} noValidate>
        {formError && (
          <div className="alert alert--danger form-grid__full" role="alert">
            {formError}
          </div>
        )}

        <div className="stack">
          <section className="card form-section">
            <h2>Basic details</h2>
            <Field
              label="Product name"
              required
              value={form.name}
              onChange={set("name")}
              error={errors.name}
            />
            <div className="form-row form-row--2">
              <Field
                label="SKU (optional)"
                value={form.sku}
                onChange={set("sku")}
                hint="Your own product code"
              />
              <Field
                label="Barcode (optional)"
                value={form.barcode}
                onChange={set("barcode")}
              />
            </div>
            <Field
              as="textarea"
              rows={4}
              label="Description (optional)"
              value={form.description}
              onChange={set("description")}
            />
          </section>

          <section className="card form-section">
            <h2>Pricing and units</h2>
            <div className="form-row form-row--3">
              <Field
                label={`Cost price (${symbol})`}
                inputMode="decimal"
                value={form.cost_price}
                onChange={set("cost_price")}
                error={errors.cost_price}
                hint="What you pay per unit"
              />
              <Field
                label={`Selling price (${symbol})`}
                inputMode="decimal"
                value={form.selling_price}
                onChange={set("selling_price")}
                error={errors.selling_price}
                hint={marginHint}
              />
              <Field
                label="Low-stock level"
                inputMode="decimal"
                value={form.min_stock_level}
                onChange={set("min_stock_level")}
                error={errors.min_stock_level}
                hint="Warn me when stock drops to this amount or below"
              />
            </div>
            <Field
              label="Unit of measure"
              list="unit-options"
              value={form.unit}
              onChange={onUnitChange}
              error={errors.unit}
              maxLength={20}
              autoComplete="off"
              hint="The word you count this product in, such as pcs, kg, litre or box. Letters only, no numbers."
            />
            <datalist id="unit-options">
              {[
                "pcs",
                "kg",
                "g",
                "litre",
                "pack",
                "box",
                "carton",
                "dozen",
                "bottle",
                "bag",
                "metre",
              ].map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
            <div className="info-note">
              {isEdit ? (
                <p>
                  In stock now:{" "}
                  <strong>
                    {formatQty(product.quantity_on_hand)} {product.unit}
                  </strong>
                  . To change how many you have, use{" "}
                  <Link
                    className="link-btn"
                    to={`/inventory?q=${encodeURIComponent(product.name)}`}
                  >
                    Update stock in Inventory
                  </Link>
                  . This form never changes your stock.
                </p>
              ) : (
                <p>
                  <strong>Unit is not the quantity.</strong> It is only the word
                  you count in. After you save this product, open{" "}
                  <strong>Inventory</strong> and choose{" "}
                  <strong>Update stock</strong> to enter how many you have.
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card form-section">
            <h2>Image</h2>
            <ImagePicker
              url={currentUrl}
              hasImage={hasImage}
              error={imageError}
              onPick={onPickImage}
              onRemove={onRemoveImage}
            />
          </section>

          <section className="card form-section">
            <h2>Organise</h2>
            <Field
              as="select"
              label="Category"
              value={form.category_id}
              onChange={set("category_id")}
            >
              <option value="">No category</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Field>
            <Field
              as="select"
              label="Supplier"
              value={form.supplier_id}
              onChange={set("supplier_id")}
              hint={supplierHint}
            >
              <option value="">No supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.is_active === false ? " (inactive)" : ""}
                </option>
              ))}
            </Field>
            {isEdit && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, is_active: e.target.checked }))
                  }
                />
                <span>
                  Active. Inactive products stay in your records but are hidden
                  from sales.
                </span>
              </label>
            )}
          </section>
        </div>

        <div className="form-actions form-grid__full">
          <Link to="/products" className="btn btn--secondary">
            Cancel
          </Link>
          <button className="btn btn--primary" disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Add product"}
          </button>
        </div>
      </form>

      {isEdit && isOwner && (
        <section className="card danger-zone">
          <h2>Delete product</h2>
          <p className="card__sub">
            Permanently remove this product. You will see exactly what it
            affects before anything happens.
          </p>
          <div>
            <button
              type="button"
              className="btn btn--danger-outline"
              onClick={() => setDeleteOpen(true)}
            >
              Delete product…
            </button>
          </div>
        </section>
      )}

      {deleteOpen && (
        <DeleteProductModal
          businessId={businessId}
          product={product}
          onClose={() => setDeleteOpen(false)}
          onDeleted={onDeleted}
        />
      )}
    </>
  );
}

export default function ProductFormPage() {
  const { productId } = useParams();
  return <ProductForm key={productId ?? "new"} productId={productId} />;
}
