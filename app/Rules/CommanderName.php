<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Str;

/** A local baseline filter; human review is still needed for contextual abuse. */
class CommanderName implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $normalized = strtolower(Str::ascii((string) $value));
        $normalized = strtr($normalized, ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't', '@' => 'a', '$' => 's', '!' => 'i']);
        $tokens = preg_split('/[^a-z]+/', $normalized, -1, PREG_SPLIT_NO_EMPTY);
        $joined = implode('', $tokens);
        // Remove known innocent substrings before scanning the remainder.
        $screened = str_replace(['scunthorpe', 'takeshita'], '', $joined);
        // Only strong terms are substring-matched. Short ambiguous words are omitted
        // so ordinary names such as Cassandra, Scunthorpe, and Dick remain valid.
        $strong = ['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot'];
        foreach ($strong as $word) {
            if (str_contains($screened, $word)) {
                $fail('Please choose a respectful commander name.');

                return;
            }
        }
        if (! preg_match('/[a-z]/', $joined)) {
            $fail('Your commander name must contain letters.');
        }
    }
}
