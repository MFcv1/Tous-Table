const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VAT_PATTERN = /^[A-Z]{2}[A-Z0-9]{2,13}$/;

const clean = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const digits = (value) => String(value || '').replace(/\D/g, '');
const compactUppercase = (value) => String(value || '').replace(/[\s.-]/g, '').toUpperCase();

const required = (errors, name, value, message) => {
    if (!clean(value)) errors[name] = message;
};

const validateContact = (errors, { emailName, email, phoneName, phone }) => {
    const normalizedEmail = clean(email);
    const normalizedPhone = digits(phone);

    if (normalizedEmail && !EMAIL_PATTERN.test(normalizedEmail)) {
        errors[emailName] = "L'adresse e-mail n'est pas valide.";
    }
    if (normalizedPhone && (normalizedPhone.length < 10 || normalizedPhone.length > 15)) {
        errors[phoneName] = 'Le numéro de téléphone doit contenir entre 10 et 15 chiffres.';
    }
};

const validateFrenchPostalCode = (errors, name, value) => {
    if (clean(value) && !/^\d{5}$/.test(digits(value))) {
        errors[name] = 'Le code postal doit contenir 5 chiffres.';
    }
};

export const getCheckoutValidation = (formData, clientType) => {
    const errors = {};

    if (clientType === 'entreprise') {
        required(errors, 'companyName', formData.companyName, 'Indiquez la raison sociale.');
        required(errors, 'contactFirstName', formData.contactFirstName, 'Indiquez le prénom du contact.');
        required(errors, 'contactLastName', formData.contactLastName, 'Indiquez le nom du contact.');
        required(errors, 'companyPhone', formData.companyPhone, 'Indiquez un téléphone professionnel.');
        required(errors, 'companyEmail', formData.companyEmail, 'Indiquez un e-mail professionnel.');
        required(errors, 'siret', formData.siret, 'Indiquez le numéro SIRET.');
        required(errors, 'companyAddress', formData.companyAddress, "Indiquez l'adresse de l'entreprise.");
        required(errors, 'companyZip', formData.companyZip, 'Indiquez le code postal.');
        required(errors, 'companyCity', formData.companyCity, 'Indiquez la ville.');
        validateContact(errors, {
            emailName: 'companyEmail',
            email: formData.companyEmail,
            phoneName: 'companyPhone',
            phone: formData.companyPhone
        });
        if (clean(formData.siret) && digits(formData.siret).length !== 14) {
            errors.siret = 'Le numéro SIRET doit contenir exactement 14 chiffres.';
        }
        if (clean(formData.tva) && !VAT_PATTERN.test(compactUppercase(formData.tva))) {
            errors.tva = 'Vérifiez le numéro de TVA (ex. FR12345678901).';
        }
        validateFrenchPostalCode(errors, 'companyZip', formData.companyZip);
    } else {
        required(errors, 'firstName', formData.firstName, 'Indiquez votre prénom.');
        required(errors, 'lastName', formData.lastName, 'Indiquez votre nom.');
        required(errors, 'phone', formData.phone, 'Indiquez votre téléphone.');
        required(errors, 'email', formData.email, 'Indiquez votre adresse e-mail.');
        required(errors, 'address', formData.address, 'Indiquez votre adresse.');
        required(errors, 'zip', formData.zip, 'Indiquez le code postal.');
        required(errors, 'city', formData.city, 'Indiquez la ville.');
        validateContact(errors, {
            emailName: 'email',
            email: formData.email,
            phoneName: 'phone',
            phone: formData.phone
        });
        validateFrenchPostalCode(errors, 'zip', formData.zip);
    }

    if (!formData.billingSameAsShipping) {
        required(errors, 'billingName', formData.billingName, 'Indiquez le nom à faire apparaître sur la facture.');
        required(errors, 'billingAddress', formData.billingAddress, "Indiquez l'adresse de facturation.");
        required(errors, 'billingZip', formData.billingZip, 'Indiquez le code postal de facturation.');
        required(errors, 'billingCity', formData.billingCity, 'Indiquez la ville de facturation.');
        validateFrenchPostalCode(errors, 'billingZip', formData.billingZip);
    }

    return {
        errors,
        isValid: Object.keys(errors).length === 0,
        firstInvalidField: Object.keys(errors)[0] || null
    };
};

const normalizeAddress = ({ name, address, addressComplement, zip, city, country }) => ({
    name: clean(name),
    address: clean(address),
    addressComplement: clean(addressComplement),
    zip: digits(zip),
    city: clean(city),
    country: clean(country) || 'France'
});

export const buildCheckoutCustomerPayload = (formData, clientType) => {
    const isCompany = clientType === 'entreprise';
    const fullName = isCompany
        ? clean(`${formData.contactFirstName} ${formData.contactLastName}`)
        : clean(`${formData.firstName} ${formData.lastName}`);
    const companyName = isCompany ? clean(formData.companyName) : '';
    const shipping = normalizeAddress({
        name: fullName,
        address: isCompany ? formData.companyAddress : formData.address,
        addressComplement: isCompany ? formData.companyAddressComplement : formData.addressComplement,
        zip: isCompany ? formData.companyZip : formData.zip,
        city: isCompany ? formData.companyCity : formData.city,
        country: isCompany ? formData.companyCountry : formData.country
    });
    const billing = formData.billingSameAsShipping
        ? normalizeAddress({ ...shipping, name: companyName || fullName })
        : normalizeAddress({
            name: formData.billingName,
            address: formData.billingAddress,
            addressComplement: formData.billingAddressComplement,
            zip: formData.billingZip,
            city: formData.billingCity,
            country: formData.billingCountry
        });

    return {
        clientType,
        fullName,
        firstName: isCompany ? clean(formData.contactFirstName) : clean(formData.firstName),
        lastName: isCompany ? clean(formData.contactLastName) : clean(formData.lastName),
        email: clean(isCompany ? formData.companyEmail : formData.email).toLowerCase(),
        phone: clean(isCompany ? formData.companyPhone : formData.phone),
        address: shipping.address,
        addressComplement: shipping.addressComplement,
        zip: shipping.zip,
        city: shipping.city,
        country: shipping.country,
        companyName,
        siret: isCompany ? digits(formData.siret) : '',
        tva: isCompany ? compactUppercase(formData.tva) : '',
        billingSameAsShipping: Boolean(formData.billingSameAsShipping),
        billing
    };
};

export const formatCheckoutAddress = (address = {}) => [
    address.address,
    address.addressComplement,
    clean(`${address.zip || ''} ${address.city || ''}`),
    address.country
].filter(Boolean).join(', ');
