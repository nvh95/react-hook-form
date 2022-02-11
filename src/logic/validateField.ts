import { INPUT_VALIDATION_RULES } from '../constants';
import {
  Field,
  FieldError,
  InternalFieldErrors,
  Message,
  NativeFieldValue,
} from '../types';
import isBoolean from '../utils/isBoolean';
import isCheckBoxInput from '../utils/isCheckBoxInput';
import isEmptyObject from '../utils/isEmptyObject';
import isFileInput from '../utils/isFileInput';
import isFunction from '../utils/isFunction';
import isMessage from '../utils/isMessage';
import isNullOrUndefined from '../utils/isNullOrUndefined';
import isObject from '../utils/isObject';
import isRadioInput from '../utils/isRadioInput';
import isRegex from '../utils/isRegex';
import isString from '../utils/isString';

import appendErrors from './appendErrors';
import getCheckboxValue from './getCheckboxValue';
import getRadioValue from './getRadioValue';
import getValidateError from './getValidateError';
import getValueAndMessage from './getValueAndMessage';

export default async <T extends NativeFieldValue>(
  field: Field,
  inputValue: T,
  validateAllFieldCriteria: boolean,
  shouldUseNativeValidation?: boolean,
): Promise<InternalFieldErrors> => {
  const {
    ref,
    refs,
    required,
    maxLength,
    minLength,
    min,
    max,
    pattern,
    validate,
    name,
    valueAsNumber,
    mount,
    disabled,
  } = field._f;
  if (!mount || disabled) {
    return {};
  }
  const inputRef: HTMLInputElement = refs ? refs[0] : (ref as HTMLInputElement);
  const setCustomValidity = (message?: string | boolean) => {
    if (shouldUseNativeValidation && inputRef.reportValidity) {
      inputRef.setCustomValidity(isBoolean(message) ? '' : message || ' ');
      inputRef.reportValidity();
    }
  };
  const error: InternalFieldErrors = {};
  const isRadio = isRadioInput(ref);
  const isCheckBox = isCheckBoxInput(ref);
  const isEmpty =
    ((valueAsNumber || isFileInput(ref)) && !ref.value) ||
    inputValue === '' ||
    (Array.isArray(inputValue) && !inputValue.length);
  const appendErrorsCurry = appendErrors.bind(
    null,
    name,
    validateAllFieldCriteria,
    error,
  );
  const getMinMaxMessage = (
    exceedMax: boolean,
    maxLengthMessage: Message,
    minLengthMessage: Message,
    maxType = INPUT_VALIDATION_RULES.maxLength,
    minType = INPUT_VALIDATION_RULES.minLength,
  ) => {
    const message = exceedMax ? maxLengthMessage : minLengthMessage;
    error[name] = {
      type: exceedMax ? maxType : minType,
      message,
      ref,
      received: inputValue,
      ...appendErrorsCurry(exceedMax ? maxType : minType, message),
    };
  };

  if (
    required &&
    ((!(isRadio || isCheckBox) && (isEmpty || isNullOrUndefined(inputValue))) ||
      (isBoolean(inputValue) && !inputValue) ||
      (isCheckBox && !getCheckboxValue(refs).isValid) ||
      (isRadio && !getRadioValue(refs).isValid))
  ) {
    const { value, message } = isMessage(required)
      ? { value: !!required, message: required }
      : getValueAndMessage(required);

    if (value) {
      error[name] = {
        type: INPUT_VALIDATION_RULES.required,
        message,
        ref: inputRef,
        received: inputValue,
        ...appendErrorsCurry(INPUT_VALIDATION_RULES.required, message),
      };
      if (!validateAllFieldCriteria) {
        setCustomValidity(message);
        return error;
      }
    }
  }

  if (!isEmpty && (!isNullOrUndefined(min) || !isNullOrUndefined(max))) {
    let exceedMax;
    let exceedMin;
    const maxOutput = getValueAndMessage(max);
    const minOutput = getValueAndMessage(min);

    if (isNaN(inputValue as number)) {
      const valueDate =
        (ref as HTMLInputElement).valueAsDate || new Date(inputValue as string);
      if (isString(maxOutput.value)) {
        exceedMax = valueDate > new Date(maxOutput.value);
      }
      if (isString(minOutput.value)) {
        exceedMin = valueDate < new Date(minOutput.value);
      }
    } else {
      const valueNumber =
        (ref as HTMLInputElement).valueAsNumber || +inputValue;
      if (!isNullOrUndefined(maxOutput.value)) {
        exceedMax = valueNumber > maxOutput.value;
      }
      if (!isNullOrUndefined(minOutput.value)) {
        exceedMin = valueNumber < minOutput.value;
      }
    }

    if (exceedMax || exceedMin) {
      getMinMaxMessage(
        !!exceedMax,
        maxOutput.message,
        minOutput.message,
        INPUT_VALIDATION_RULES.max,
        INPUT_VALIDATION_RULES.min,
      );
      if (!validateAllFieldCriteria) {
        setCustomValidity(error[name]!.message);
        return error;
      }
    }
  }

  if ((maxLength || minLength) && !isEmpty && isString(inputValue)) {
    const maxLengthOutput = getValueAndMessage(maxLength);
    const minLengthOutput = getValueAndMessage(minLength);
    const exceedMax =
      !isNullOrUndefined(maxLengthOutput.value) &&
      inputValue.length > maxLengthOutput.value;
    const exceedMin =
      !isNullOrUndefined(minLengthOutput.value) &&
      inputValue.length < minLengthOutput.value;

    if (exceedMax || exceedMin) {
      getMinMaxMessage(
        exceedMax,
        maxLengthOutput.message,
        minLengthOutput.message,
      );
      if (!validateAllFieldCriteria) {
        setCustomValidity(error[name]!.message);
        return error;
      }
    }
  }

  if (pattern && !isEmpty && isString(inputValue)) {
    const { value: patternValue, message } = getValueAndMessage(pattern);

    if (isRegex(patternValue) && !inputValue.match(patternValue)) {
      error[name] = {
        type: INPUT_VALIDATION_RULES.pattern,
        message,
        ref,
        received: inputValue,
        ...appendErrorsCurry(INPUT_VALIDATION_RULES.pattern, message),
      };
      if (!validateAllFieldCriteria) {
        setCustomValidity(message);
        return error;
      }
    }
  }

  if (validate) {
    if (isFunction(validate)) {
      const result = await validate(inputValue);
      const validateError = getValidateError(result, inputRef);

      if (validateError) {
        error[name] = {
          ...validateError,
          ...appendErrorsCurry(
            INPUT_VALIDATION_RULES.validate,
            validateError.message,
          ),
        };
        if (!validateAllFieldCriteria) {
          setCustomValidity(validateError.message);
          return error;
        }
      }
    } else if (isObject(validate)) {
      let validationResult = {} as FieldError;

      for (const key in validate) {
        if (!isEmptyObject(validationResult) && !validateAllFieldCriteria) {
          break;
        }

        const validateError = getValidateError(
          await validate[key](inputValue),
          inputRef,
          key,
        );

        if (validateError) {
          validationResult = {
            ...validateError,
            ...appendErrorsCurry(key, validateError.message),
          };

          setCustomValidity(validateError.message);

          if (validateAllFieldCriteria) {
            error[name] = validationResult;
          }
        }
      }

      if (!isEmptyObject(validationResult)) {
        error[name] = {
          ref: inputRef,
          ...validationResult,
        };
        if (!validateAllFieldCriteria) {
          return error;
        }
      }
    }
  }

  setCustomValidity(true);
  return error;
};
